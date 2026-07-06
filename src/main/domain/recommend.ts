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
 *  - max_recent_apps_person { months, max }           application pacing per person
 *  - max_recent_apps_business { months, max }         application pacing per business
 *  - min_spend_capacity { lookbackMonths, buffer }    min-spend must fit tracked spend rate × window
 *  - min_bonus_value { minCents }                     skip small bonuses
 */

export interface RecommendInput {
  offers: {
    id: number
    cardProductId: number
    productName: string
    issuerName: string | null
    isBusiness: boolean
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
  })[]
  spendEntries: { amountCents: number; date: string }[]
  rules: { kind: string; params: Record<string, unknown> }[]
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

const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function monthsAgoIso(months: number, from: Date): string {
  return toIso(new Date(from.getFullYear(), from.getMonth() - months, from.getDate()))
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toIso(new Date(y, m - 1 + months, d))
}

const dollars = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`

/** Application date for pacing rules: when applied, falling back to opened. */
const appDate = (c: { appliedDate: string | null; openedDate: string | null }): string | null =>
  c.appliedDate ?? c.openedDate

export function recommend(input: RecommendInput): PersonRecommendations[] {
  const { today } = input

  // Tracked monthly spend rate, per min_spend_capacity's lookback.
  const spendRate = (lookbackMonths: number): number => {
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
        default:
          break // unknown kinds are ignored, not fatal
      }
    }

    // Expired offers never qualify.
    if (offer.expires && offer.expires < toIso(today)) {
      blocks.push({ kind: 'expired', reason: `offer expired ${offer.expires}`, waitUntil: null })
    }

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
    const byValue = (a: Candidate, b: Candidate) => (b.valueCents ?? 0) - (a.valueCents ?? 0)
    return {
      personId: person.id,
      name: person.name,
      atChase524: velocityByPerson.get(person.id)?.atChase524 ?? false,
      recommended: candidates.filter((c) => c.blocks.length === 0).sort(byValue),
      blocked: candidates.filter((c) => c.blocks.length > 0).sort(byValue)
    }
  })
}
