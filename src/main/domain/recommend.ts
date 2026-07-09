import { addMonthsIso, monthsAgoIso, toIsoDate, todayIso } from '@shared/dates'
import type { RewardCategory } from '@shared/format'
import { bonusRemainingCents, isBonusOpen } from './bonus'
import { personVelocity, type VelocityCardLike } from './velocity'

/**
 * The recommendation rules engine.
 *
 * Candidates are (offer × person) for personal products and
 * (offer × business) for business products. Every enabled rule gets a chance
 * to block each candidate with a human-readable reason and — where the
 * blocker expires on a knowable date — a waitUntil. Candidates with no blocks
 * are recommended, ranked by bonus value; blocked ones are reported with
 * their reasons so the result explains itself.
 *
 * Rule kinds (params are JSON on the stored rule):
 *  - no_duplicate_product { scope: 'holder' }         skip products the person/business already holds
 *  - under_524 { issuers: string[] | null }           at/over 5/24 blocks listed issuers (null = all)
 *  - reserve_524_slots { slots, forIssuers, spendLastSlots }
 *        near 5/24, park counting cards; protected issuers may spend the
 *        reserved slots only when spendLastSlots is true
 *  - max_recent_apps_person { months, max }           application pacing per person
 *  - max_recent_apps_business { months, max }         application pacing per business
 *  - max_recent_apps_issuer { issuer, months, max, businessOnly }
 *        per person for one issuer, counting personal AND business
 *        applications together (they share the SSN); businessOnly paces just
 *        the business-card queue (e.g. Chase's ~90-day consensus)
 *  - max_open_matching { issuer, match, max }          per-person cap on OPEN cards whose
 *        product name matches (e.g. 3 open Inks) — blocks matching offers
 *        until one is closed
 *  - min_spend_capacity { lookbackMonths, buffer }    min-spend must fit tracked spend rate × window
 *  - min_bonus_value { minCents }                     skip small bonuses
 *  - finish_open_bonuses { maxOpenMonths, lookbackMonths }
 *        household-wide: wait while remaining min-spend on open bonuses is
 *        maxOpenMonths+ of tracked spend pace; waitUntil projects when pace
 *        or deadlines bring the open spend back under the threshold
 *  - family_bonus_order { families? }                  issuer "family" welcome-offer hierarchies
 *        (defaults to Amex's): getting a higher-tier card forfeits lower-tier
 *        welcome offers, so higher tiers are blocked while a lower-tier bonus
 *        is still collectable, and lower tiers are blocked once a higher tier
 *        was ever held
 */

/** One ordered card family for family_bonus_order. Names are matched
 *  case-insensitively by substring: a product is in the family when its name
 *  contains every `include` term and no `exclude` term (and the issuer
 *  matches, when known); its tier is the highest-indexed `tiers` pattern the
 *  name contains. */
export interface BonusFamily {
  label: string
  issuer?: string
  include?: string[]
  exclude?: string[]
  /** Low to high; e.g. Amex MR: green < gold < platinum. */
  tiers: string[]
}

/**
 * Amex's published family rules (the family_bonus_order default): welcome
 * offers are ineligible on a card whose family sibling of a HIGHER tier was
 * ever held, so bonuses must be collected bottom-up. All Platinum variants
 * (vanilla/Schwab/Morgan Stanley) are one tier; Graphite is assumed above
 * Platinum. Delta, Hilton, and Blue Cash are their own families — Delta Gold
 * has nothing to do with the MR Gold. Marriott is deliberately absent
 * (cross-issuer 24-month rules don't fit this model). Business cards carry
 * only per-card lifetime language, so they're excluded here.
 */
export const AMEX_FAMILIES: BonusFamily[] = [
  {
    label: 'Amex Membership Rewards',
    issuer: 'American Express',
    exclude: ['business', 'delta', 'hilton', 'marriott', 'bonvoy', 'blue cash', 'everyday', 'corporate'],
    tiers: ['green', 'gold', 'platinum', 'graphite']
  },
  {
    label: 'Amex Delta',
    issuer: 'American Express',
    include: ['delta'],
    exclude: ['business'],
    tiers: ['blue', 'gold', 'platinum', 'reserve']
  },
  {
    label: 'Amex Hilton',
    issuer: 'American Express',
    include: ['hilton'],
    exclude: ['business'],
    tiers: ['hilton', 'surpass', 'aspire']
  },
  {
    label: 'Amex Blue Cash',
    issuer: 'American Express',
    include: ['blue cash'],
    exclude: ['business'],
    tiers: ['everyday', 'preferred']
  }
]

/** Tier index of a product in a family, or -1 when it isn't in the family. */
function familyTier(
  f: BonusFamily,
  productName: string | null | undefined,
  issuerName: string | null | undefined
): number {
  const name = (productName ?? '').toLowerCase()
  if (!name) return -1
  // Held cards without a linked product/issuer stay out rather than guessing.
  if (f.issuer && issuerName !== f.issuer) return -1
  if ((f.include ?? []).some((t) => !name.includes(t))) return -1
  if ((f.exclude ?? []).some((t) => name.includes(t))) return -1
  for (let i = f.tiers.length - 1; i >= 0; i--) if (name.includes(f.tiers[i])) return i
  return -1
}

export interface RecommendInput {
  offers: {
    id: number
    cardProductId: number
    productName: string
    issuerName: string | null
    isBusiness: boolean
    /** Business products from a few issuers count toward 5/24. */
    reportsToPersonal?: boolean
    pointsAmount?: number | null
    cashAmountCents?: number | null
    currency?: string | null
    /** What the bonus pays out in (see offerRewardCategory); defaults to card points. */
    rewardCategory?: RewardCategory
    /** Product's baseline earn rate (percent). */
    earnPct?: number | null
    /** What a referrer earns when this application uses their link. */
    referralValueCents?: number | null
    /** Product's annual fee; subtracted from first-year value unless waived. */
    annualFeeCents?: number | null
    feeWaivedFirstYear?: boolean
    valueCents: number | null
    minSpendCents: number | null
    windowMonths: number | null
    expires: string | null
  }[]
  people: { id: number; name: string }[]
  businesses: { id: number; name: string; ownerPersonId: number }[]
  cards: (VelocityCardLike & {
    cardProductId: number | null
    ownerPersonId: number | null
    appliedDate: string | null
    /** Linked product/issuer names — the family_bonus_order rule matches on these. */
    productName?: string | null
    productIssuerName?: string | null
  })[]
  spendEntries: { amountCents: number; date: string }[]
  /** Signup bonuses on held cards; unfinished ones gate new applications. */
  bonuses: {
    targetSpendCents: number | null
    spendSoFarCents: number
    deadline: string | null
    received: boolean
  }[]
  /**
   * Stored referral links per product. Only 'user' links (owned by a saved
   * person/business) count referral value toward household ROI; 'seeded'
   * links ship with the app and credit its author, so they surface for
   * applying but add nothing to the math.
   */
  referralLinks: {
    cardProductId: number
    url: string
    source: string // 'seeded' | 'user'
    /** Beneficiary person (business links resolve to the business owner); null for seeded. */
    ownerPersonId: number | null
    /** Beneficiary display name; null for seeded links. */
    ownerName: string | null
  }[]
  rules: { kind: string; params: Record<string, unknown> }[]
  /**
   * Projected monthly spend. When set, capacity rules use it directly;
   * when null, the rate is derived from tracked spend entries (legacy
   * behavior). Callers resolve the manual override / report-based default.
   */
  monthlySpendCents?: number | null
  today: Date
}

export interface Block {
  kind: string
  reason: string
  waitUntil: string | null
}

export interface Candidate {
  offerId: number
  cardProductId: number
  label: string
  issuerName: string | null
  isBusiness: boolean
  personId: number
  businessId: number | null
  businessName: string | null
  valueCents: number | null
  pointsAmount: number | null
  cashAmountCents: number | null
  currency: string | null
  rewardCategory: RewardCategory
  earnPct: number | null
  /** Beneficiary of the stored referral link this application would use. */
  referralFrom: string | null
  /** Referrer's bonus — counted only when a saved person/business owns the link. */
  referralValueCents: number | null
  /** Any stored link (user or seeded) — ROI ties break in its favor. */
  hasReferralLink: boolean
  /** Link to apply through: the household's own if stored, else the seeded one. */
  referralLinkUrl: string | null
  /** True when the surfaced link is the seeded one (credits the app author). */
  referralLinkSeeded: boolean
  annualFeeCents: number | null
  feeWaivedFirstYear: boolean
  /** Baseline earn on the required min spend (minSpend × earn rate). */
  earnOnSpendCents: number | null
  /** Bonus + referral + earn on required spend − first-year fee. */
  totalValueCents: number | null
  /** Net household value as a percent of the required spend. */
  roiPct: number | null
  minSpendCents: number | null
  windowMonths: number | null
  blocks: Block[]
  /** Latest blocker expiry when every block has one; null otherwise. */
  waitUntil: string | null
}

export interface PersonRecommendations {
  personId: number
  name: string
  atChase524: boolean
  recommended: Candidate[]
  blocked: Candidate[]
}

const dollars = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`

/** Application date for pacing rules: when applied, falling back to opened. */
const appDate = (c: { appliedDate: string | null; openedDate: string | null }): string | null =>
  c.appliedDate ?? c.openedDate

export function recommend(input: RecommendInput): PersonRecommendations[] {
  const { today } = input

  // Projected monthly spend: the caller-resolved value when present, else
  // the tracked rate over the rule's lookback window.
  const spendRate = (lookbackMonths: number): number => {
    if (input.monthlySpendCents != null) return input.monthlySpendCents
    const cutoff = monthsAgoIso(lookbackMonths, today)
    const total = input.spendEntries
      .filter((e) => e.date >= cutoff)
      .reduce((n, e) => n + e.amountCents, 0)
    return total / Math.max(1, lookbackMonths)
  }

  const velocityByPerson = new Map(
    input.people.map((p) => [
      p.id,
      personVelocity(input.cards.filter((c) => c.ownerPersonId === p.id), today)
    ])
  )

  const recentApps = (cards: RecommendInput['cards'], months: number): string[] =>
    cards
      .map(appDate)
      .filter((d): d is string => d != null && d >= monthsAgoIso(months, today))
      .sort()

  function evaluate(
    offer: RecommendInput['offers'][number],
    personId: number,
    businessId: number | null
  ): Candidate {
    const blocks: Block[] = []
    const holderCards = input.cards.filter((c) =>
      businessId != null ? c.businessId === businessId : c.ownerPersonId === personId && c.businessId == null
    )
    const personCards = input.cards.filter((c) => c.ownerPersonId === personId)

    for (const rule of input.rules) {
      const p = rule.params
      switch (rule.kind) {
        case 'no_duplicate_product': {
          const held = holderCards.some(
            (c) => c.cardProductId === offer.cardProductId && c.status !== 'rejected' && c.status !== 'closed'
          )
          if (held) blocks.push({ kind: rule.kind, reason: 'already holds this card', waitUntil: null })
          break
        }
        case 'under_524': {
          const issuers = (p.issuers as string[] | null | undefined) ?? null
          if (issuers && (offer.issuerName == null || !issuers.includes(offer.issuerName))) break
          const v = velocityByPerson.get(personId)
          if (v?.atChase524) {
            blocks.push({
              kind: rule.kind,
              reason: `at ${v.count}/24 — ${offer.issuerName ?? 'issuer'} will decline`,
              waitUntil: v.under524Date
            })
          }
          break
        }
        case 'reserve_524_slots': {
          // Getting this card consumes a 5/24 slot unless it's a
          // non-reporting business card.
          const consumesSlot = !offer.isBusiness || offer.reportsToPersonal === true
          if (!consumesSlot) break
          const slots = Number(p.slots ?? 1)
          const forIssuers = (p.forIssuers as string[] | undefined) ?? ['Chase']
          // By default nothing may spend the reserved slots — a recommendation
          // never pushes someone to 5/24. Opt in with spendLastSlots to let
          // protected issuers use them (the "save it FOR Chase" strategy).
          const protectedIssuer =
            offer.issuerName != null && forIssuers.includes(offer.issuerName)
          if (protectedIssuer && p.spendLastSlots === true) break
          const v = velocityByPerson.get(personId)
          if (!v) break
          const freeSlots = 5 - v.count
          if (freeSlots > slots) break
          // Unblocks once enough cards age out that free slots exceed the reserve.
          const dropNeeded = v.count - (4 - slots)
          const gate = v.contributing[v.contributing.length - dropNeeded]
          blocks.push({
            kind: rule.kind,
            reason: protectedIssuer
              ? `would put them at ${v.count + 1}/24`
              : `at ${v.count}/24 — reserving ${slots} slot${slots === 1 ? '' : 's'} for ${forIssuers.join('/')}`,
            waitUntil: gate?.openedDate ? addMonthsIso(gate.openedDate, 24) : null
          })
          break
        }
        case 'max_recent_apps_person': {
          const months = Number(p.months ?? 3)
          const max = Number(p.max ?? 2)
          // Personal applications only — business apps are paced per business.
          const apps = recentApps(personCards.filter((c) => c.businessId == null), months)
          if (apps.length >= max) {
            blocks.push({
              kind: rule.kind,
              reason: `${apps.length} personal applications in ${months} mo (max ${max})`,
              waitUntil: addMonthsIso(apps[apps.length - max], months)
            })
          }
          break
        }
        case 'max_recent_apps_issuer': {
          const issuer = (p.issuer as string | undefined) ?? 'Chase'
          if (offer.issuerName !== issuer) break
          // businessOnly: pace just business cards (e.g. the ~90-day Chase
          // business-app consensus) — the offer and the counted cards are
          // both business-side, but still per person: a second entity doesn't
          // get its own lane.
          const businessOnly = p.businessOnly === true
          if (businessOnly && !offer.isBusiness) break
          const months = Number(p.months ?? 1)
          const max = Number(p.max ?? 1)
          // Business cards carry the applicant's personal guarantee, so the
          // issuer sees every application — personal or under any business —
          // on one profile. Pace them together per person.
          const apps = recentApps(
            personCards.filter(
              (c) => c.productIssuerName === issuer && (!businessOnly || c.businessId != null)
            ),
            months
          )
          if (apps.length >= max) {
            blocks.push({
              kind: rule.kind,
              reason: `${apps.length} ${issuer}${businessOnly ? ' business' : ''} application${apps.length === 1 ? '' : 's'} in ${months} mo across personal + businesses (max ${max})`,
              waitUntil: addMonthsIso(apps[apps.length - max], months)
            })
          }
          break
        }
        case 'max_open_matching': {
          const issuer = (p.issuer as string | undefined) ?? 'Chase'
          const match = ((p.match as string[] | undefined) ?? []).map((m) => m.toLowerCase())
          if (match.length === 0) break
          const matches = (name: string | null | undefined, cardIssuer: string | null | undefined): boolean =>
            cardIssuer === issuer && match.some((m) => (name ?? '').toLowerCase().includes(m))
          if (!matches(offer.productName, offer.issuerName)) break
          const max = Number(p.max ?? 3)
          // Open count is per person across every holder — the issuer
          // underwrites the person, so entity #2 doesn't reset the ceiling.
          const open = personCards.filter(
            (c) => c.status === 'open' && matches(c.productName, c.productIssuerName)
          )
          if (open.length >= max) {
            blocks.push({
              kind: rule.kind,
              reason: `already holds ${open.length} open ${issuer} ${match.join('/')} card${open.length === 1 ? '' : 's'} across all businesses (max ${max}) — close one before applying`,
              waitUntil: null
            })
          }
          break
        }
        case 'max_recent_apps_business': {
          if (businessId == null) break
          const months = Number(p.months ?? 6)
          const max = Number(p.max ?? 2)
          const apps = recentApps(input.cards.filter((c) => c.businessId === businessId), months)
          if (apps.length >= max) {
            blocks.push({
              kind: rule.kind,
              reason: `${apps.length} applications for this business in ${months} mo (max ${max})`,
              waitUntil: addMonthsIso(apps[apps.length - max], months)
            })
          }
          break
        }
        case 'min_spend_capacity': {
          if (offer.minSpendCents == null) break
          const lookback = Number(p.lookbackMonths ?? 3)
          const buffer = Number(p.buffer ?? 1)
          const windowMonths = offer.windowMonths ?? 3
          const capacity = spendRate(lookback) * windowMonths * buffer
          if (offer.minSpendCents > capacity) {
            blocks.push({
              kind: rule.kind,
              reason: `min spend ${dollars(offer.minSpendCents)} exceeds ~${dollars(capacity)} capacity over ${windowMonths} mo`,
              waitUntil: null
            })
          }
          break
        }
        case 'finish_open_bonuses': {
          const maxOpenMonths = Number(p.maxOpenMonths ?? 2)
          const lookback = Number(p.lookbackMonths ?? 3)
          // Open per the shared predicate; only quantifiable (targeted)
          // remaining spend counts toward the gate.
          const open = input.bonuses
            .filter((b) => isBonusOpen(b, todayIso(today)))
            .map((b) => ({ remaining: bonusRemainingCents(b) ?? 0, deadline: b.deadline }))
            .filter((b) => b.remaining > 0)
          const remaining = open.reduce((n, b) => n + b.remaining, 0)
          const rate = spendRate(lookback)
          const thresholdCents = maxOpenMonths * rate
          if (remaining === 0 || remaining < thresholdCents) break
          // Unblocks when open spend falls under the threshold — by pace, or
          // by deadlines expiring bonuses out of the open set, whichever first.
          const paceDate =
            rate > 0
              ? toIsoDate(
                  new Date(
                    today.getFullYear(),
                    today.getMonth(),
                    today.getDate() + Math.ceil(((remaining - thresholdCents) / rate) * 30)
                  )
                )
              : null
          const deadlineDate =
            [...new Set(open.map((b) => b.deadline).filter((d): d is string => d != null))]
              .sort()
              .find(
                (d) =>
                  open
                    .filter((b) => b.deadline == null || b.deadline > d)
                    .reduce((n, b) => n + b.remaining, 0) <= thresholdCents
              ) ?? null
          blocks.push({
            kind: rule.kind,
            reason:
              rate > 0
                ? `${dollars(remaining)} of open bonus spend ≈ ${(remaining / rate).toFixed(1)} mo at current pace — finish current bonuses first`
                : `${dollars(remaining)} of open bonus spend and no tracked spend in ${lookback} mo`,
            waitUntil:
              paceDate != null && deadlineDate != null
                ? paceDate < deadlineDate
                  ? paceDate
                  : deadlineDate
                : (paceDate ?? deadlineDate)
          })
          break
        }
        case 'min_bonus_value': {
          const minCents = Number(p.minCents ?? 0)
          if (offer.valueCents == null || offer.valueCents < minCents) {
            blocks.push({
              kind: rule.kind,
              reason:
                offer.valueCents == null
                  ? 'bonus value unknown'
                  : `value ${dollars(offer.valueCents)} below ${dollars(minCents)} minimum`,
              waitUntil: null
            })
          }
          break
        }
        case 'family_bonus_order': {
          const families = (p.families as BonusFamily[] | undefined) ?? AMEX_FAMILIES
          // Welcome-offer eligibility is per person (Amex doesn't care which
          // business applies), and "have or have had" includes closed cards —
          // only rejected applications never held the card.
          const everHeld = personCards.filter((c) => c.status !== 'rejected')
          for (const f of families) {
            const offerTier = familyTier(f, offer.productName, offer.issuerName)
            if (offerTier < 0) continue
            let maxHeldTier = -1
            let maxHeldName: string | null = null
            for (const c of everHeld) {
              const t = familyTier(f, c.productName, c.productIssuerName)
              if (t > maxHeldTier) {
                maxHeldTier = t
                maxHeldName = c.productName ?? null
              }
            }
            // Same tier blocks too: all Platinum variants carry each other in
            // their family language, and re-applying for a card once held
            // (even closed) never re-earns its own bonus.
            if (maxHeldTier >= offerTier) {
              blocks.push({
                kind: rule.kind,
                reason: `won't get the bonus — already had ${maxHeldName ?? 'a same-or-higher card'} (${f.label} family rule)`,
                waitUntil: null
              })
              continue
            }
            // Lower-tier bonuses still collectable (offer in feed, tier above
            // anything held) would be forfeited by taking this card first.
            const forfeited = [
              ...new Set(
                input.offers
                  .filter((o) => {
                    const t = familyTier(f, o.productName, o.issuerName)
                    return t >= 0 && t < offerTier && t > maxHeldTier
                  })
                  .map((o) => o.productName)
              )
            ]
            if (forfeited.length > 0) {
              blocks.push({
                kind: rule.kind,
                reason: `getting this first forfeits the ${forfeited.join(' and ')} bonus${forfeited.length > 1 ? 'es' : ''} (${f.label} family rule) — apply for ${forfeited.length > 1 ? 'those' : 'that'} first`,
                waitUntil: null
              })
            }
          }
          break
        }
        default:
          break // unknown kinds are ignored, not fatal
      }
    }

    // Expired offers never qualify.
    if (offer.expires && offer.expires < todayIso(today)) {
      blocks.push({ kind: 'expired', reason: `offer expired ${offer.expires}`, waitUntil: null })
    }

    // Referral value needs a STORED LINK owned by a saved person/business —
    // and not by the applicant, since issuers attribute referrals per person
    // and a person's own link (personal or via their businesses) can never
    // refer their own application. Seeded links (shipped with the app,
    // crediting its author) surface for applying but add no household value.
    const links = input.referralLinks.filter((l) => l.cardProductId === offer.cardProductId)
    const userLink = links.find(
      (l) => l.source === 'user' && l.ownerPersonId != null && l.ownerPersonId !== personId
    )
    const surfacedLink = userLink ?? links.find((l) => l.source === 'seeded') ?? null
    const referralFrom = userLink?.ownerName ?? null
    const referralValueCents =
      userLink != null && offer.referralValueCents != null ? offer.referralValueCents : null
    const firstYearFee = offer.feeWaivedFirstYear ? 0 : (offer.annualFeeCents ?? 0)
    const earnOnSpendCents =
      offer.minSpendCents != null && offer.earnPct != null && offer.earnPct > 0
        ? Math.round((offer.minSpendCents * offer.earnPct) / 100)
        : null
    const totalValueCents =
      offer.valueCents != null
        ? offer.valueCents + (referralValueCents ?? 0) + (earnOnSpendCents ?? 0) - firstYearFee
        : null

    const business = businessId != null ? input.businesses.find((b) => b.id === businessId) : null
    const waitUntil =
      blocks.length > 0 && blocks.every((b) => b.waitUntil != null)
        ? blocks.reduce((max, b) => ((b.waitUntil as string) > max ? (b.waitUntil as string) : max), '')
        : null

    return {
      offerId: offer.id,
      cardProductId: offer.cardProductId,
      label: `${offer.issuerName ?? ''} ${offer.productName}`.trim(),
      issuerName: offer.issuerName,
      isBusiness: offer.isBusiness,
      personId,
      businessId,
      businessName: business?.name ?? null,
      valueCents: offer.valueCents,
      pointsAmount: offer.pointsAmount ?? null,
      cashAmountCents: offer.cashAmountCents ?? null,
      currency: offer.currency ?? null,
      rewardCategory: offer.rewardCategory ?? 'points',
      earnPct: offer.earnPct ?? null,
      referralFrom,
      referralValueCents,
      hasReferralLink: links.length > 0,
      referralLinkUrl: surfacedLink?.url ?? null,
      referralLinkSeeded: surfacedLink?.source === 'seeded',
      annualFeeCents: offer.annualFeeCents ?? null,
      feeWaivedFirstYear: offer.feeWaivedFirstYear ?? false,
      earnOnSpendCents,
      totalValueCents,
      roiPct:
        totalValueCents != null && offer.minSpendCents != null && offer.minSpendCents > 0
          ? (totalValueCents / offer.minSpendCents) * 100
          : null,
      minSpendCents: offer.minSpendCents,
      windowMonths: offer.windowMonths,
      blocks,
      waitUntil
    }
  }

  return input.people.map((person) => {
    const candidates: Candidate[] = []
    for (const offer of input.offers) {
      if (offer.isBusiness) {
        for (const biz of input.businesses.filter((b) => b.ownerPersonId === person.id)) {
          candidates.push(evaluate(offer, person.id, biz.id))
        }
      } else {
        candidates.push(evaluate(offer, person.id, null))
      }
    }
    // ROI first (offers without a computable ROI sink); ties prefer products
    // with a stored referral link (someone benefits from the application),
    // then household value.
    const byRoi = (a: Candidate, b: Candidate) =>
      (b.roiPct ?? -1) - (a.roiPct ?? -1) ||
      Number(b.hasReferralLink) - Number(a.hasReferralLink) ||
      (b.totalValueCents ?? 0) - (a.totalValueCents ?? 0)
    return {
      personId: person.id,
      name: person.name,
      atChase524: velocityByPerson.get(person.id)?.atChase524 ?? false,
      recommended: candidates.filter((c) => c.blocks.length === 0).sort(byRoi),
      blocked: candidates.filter((c) => c.blocks.length > 0).sort(byRoi)
    }
  })
}
