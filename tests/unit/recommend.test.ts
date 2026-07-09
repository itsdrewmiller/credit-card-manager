import { describe, it, expect } from 'vitest'
import { recommend, type RecommendInput } from '../../src/main/domain/recommend'

const today = new Date('2026-07-06T12:00:00')

const CSR = {
  id: 1,
  cardProductId: 100,
  productName: 'Sapphire Preferred',
  issuerName: 'Chase',
  isBusiness: false,
  valueCents: 90000,
  minSpendCents: 400000,
  windowMonths: 3,
  expires: null
}
const SPARK = {
  id: 2,
  cardProductId: 200,
  productName: 'Spark Cash Plus',
  issuerName: 'Capital One',
  isBusiness: true,
  valueCents: 120000,
  minSpendCents: 600000,
  windowMonths: 3,
  expires: null
}

function base(over: Partial<RecommendInput> = {}): RecommendInput {
  return {
    offers: [CSR, SPARK],
    people: [{ id: 1, name: 'Drew' }],
    businesses: [{ id: 10, name: 'Lambda', ownerPersonId: 1 }],
    cards: [],
    // $2k/mo tracked for the last 3 months
    spendEntries: [
      { amountCents: 200000, date: '2026-05-01' },
      { amountCents: 200000, date: '2026-06-01' },
      { amountCents: 200000, date: '2026-07-01' }
    ],
    bonuses: [],
    referralLinks: [],
    rules: [],
    today,
    ...over
  }
}

describe('recommend', () => {
  it('recommends personal offers per person and business offers per business', () => {
    const [drew] = recommend(base())
    // ROI order: CSP $900/$4k (22.5%) beats Spark $1200/$6k (20%).
    expect(drew.recommended.map((c) => [c.label, c.businessName])).toEqual([
      ['Chase Sapphire Preferred', null],
      ['Capital One Spark Cash Plus', 'Lambda']
    ])
    expect(drew.blocked).toHaveLength(0)
  })

  it('blocks products already held, at the right scope', () => {
    const [drew] = recommend(
      base({
        cards: [
          { id: 1, cardProductId: 100, ownerPersonId: 1, businessId: null, appliedDate: null, openedDate: '2024-01-01', status: 'open' }
        ],
        rules: [{ kind: 'no_duplicate_product', params: { scope: 'holder' } }]
      })
    )
    expect(drew.recommended.map((c) => c.label)).toEqual(['Capital One Spark Cash Plus'])
    expect(drew.blocked[0].blocks[0].reason).toBe('already holds this card')
  })

  it('blocks listed issuers at 5/24 with the back-under date as waitUntil', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      cardProductId: 900 + i,
      ownerPersonId: 1,
      businessId: null,
      appliedDate: null,
      openedDate: i === 4 ? '2025-01-15' : '2026-03-01',
      status: 'open'
    }))
    const [drew] = recommend(
      base({ cards: five, rules: [{ kind: 'under_524', params: { issuers: ['Chase'] } }] })
    )
    expect(drew.atChase524).toBe(true)
    const chase = drew.blocked.find((c) => c.label.includes('Sapphire'))!
    expect(chase.blocks[0].kind).toBe('under_524')
    expect(chase.waitUntil).toBe('2027-01-15') // oldest ages out
    // Non-Chase offer unaffected by an issuer-scoped rule.
    expect(drew.recommended.map((c) => c.label)).toEqual(['Capital One Spark Cash Plus'])
  })

  it('reserves 5/24 slots for protected issuers when close to the limit', () => {
    // Four counting cards -> one free slot; slots:1 engages the reserve.
    const four = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      cardProductId: 900 + i,
      ownerPersonId: 1,
      businessId: null,
      appliedDate: null,
      openedDate: i === 3 ? '2025-02-01' : '2026-03-01',
      status: 'open'
    }))
    const AMEX = { ...CSR, id: 3, cardProductId: 300, productName: 'Gold', issuerName: 'American Express' }
    const NONREPORTING = { ...SPARK, id: 4, cardProductId: 400, productName: 'Ink Preferred', issuerName: 'Chase' }
    const [drew] = recommend(
      base({
        offers: [CSR, AMEX, SPARK, NONREPORTING],
        cards: four,
        rules: [{ kind: 'reserve_524_slots', params: { slots: 1, forIssuers: ['Chase'] } }]
      })
    )
    // Non-reporting business cards still flow; ALL counting personal cards are
    // parked — a recommendation never pushes someone to 5/24 by default.
    expect(drew.recommended.map((c) => c.label).sort()).toEqual([
      'Capital One Spark Cash Plus', // SPARK has no reportsToPersonal -> doesn't consume a slot
      'Chase Ink Preferred'
    ])
    const chase = drew.blocked.find((c) => c.label.includes('Sapphire'))!
    expect(chase.blocks[0].reason).toBe('would put them at 5/24')
    // The Amex personal card would burn the reserved slot.
    const amex = drew.blocked.find((c) => c.label.includes('Gold'))!
    expect(amex.blocks[0].kind).toBe('reserve_524_slots')
    expect(amex.blocks[0].reason).toMatch(/reserving 1 slot for Chase/)
    expect(amex.waitUntil).toBe('2027-02-01') // oldest counting card ages out

    // Opting in lets protected issuers spend the reserved slot.
    const [spender] = recommend(
      base({
        offers: [CSR, AMEX],
        cards: four,
        rules: [
          { kind: 'reserve_524_slots', params: { slots: 1, forIssuers: ['Chase'], spendLastSlots: true } }
        ]
      })
    )
    expect(spender.recommended.map((c) => c.label)).toContain('Chase Sapphire Preferred')
    expect(spender.recommended.map((c) => c.label)).not.toContain('American Express Gold')

    // A reporting business product also consumes a slot -> blocked too.
    const [drew2] = recommend(
      base({
        offers: [{ ...SPARK, reportsToPersonal: true }],
        cards: four,
        rules: [{ kind: 'reserve_524_slots', params: { slots: 1, forIssuers: ['Chase'] } }]
      })
    )
    expect(drew2.blocked).toHaveLength(1)

    // Plenty of slots -> rule stays quiet.
    const [calm] = recommend(
      base({
        offers: [AMEX],
        cards: four.slice(0, 2),
        rules: [{ kind: 'reserve_524_slots', params: { slots: 1, forIssuers: ['Chase'] } }]
      })
    )
    expect(calm.recommended).toHaveLength(1)
  })

  it('paces recent applications per person with a computable waitUntil', () => {
    const [drew] = recommend(
      base({
        cards: [
          { id: 1, cardProductId: 901, ownerPersonId: 1, businessId: null, appliedDate: '2026-06-15', openedDate: null, status: 'applied' },
          { id: 2, cardProductId: 902, ownerPersonId: 1, businessId: null, appliedDate: '2026-05-20', openedDate: null, status: 'applied' }
        ],
        rules: [{ kind: 'max_recent_apps_person', params: { months: 3, max: 2 } }]
      })
    )
    expect(drew.recommended).toHaveLength(0)
    // Second-most-recent app (2026-05-20) leaves the 3mo window on 2026-08-20.
    expect(drew.blocked[0].waitUntil).toBe('2026-08-20')
  })

  it('ignores business applications when pacing personal ones', () => {
    const [drew] = recommend(
      base({
        cards: [
          { id: 1, cardProductId: 901, ownerPersonId: 1, businessId: 10, appliedDate: '2026-06-15', openedDate: null, status: 'applied' },
          { id: 2, cardProductId: 902, ownerPersonId: 1, businessId: 10, appliedDate: '2026-05-20', openedDate: null, status: 'applied' }
        ],
        rules: [{ kind: 'max_recent_apps_person', params: { months: 3, max: 2 } }]
      })
    )
    // Two recent BUSINESS apps must not block personal recommendations.
    expect(drew.recommended.map((c) => c.label)).toContain('Chase Sapphire Preferred')
  })

  it('paces applications per business without touching personal offers', () => {
    const [drew] = recommend(
      base({
        cards: [
          { id: 1, cardProductId: 901, ownerPersonId: 1, businessId: 10, appliedDate: '2026-06-15', openedDate: null, status: 'applied' }
        ],
        rules: [{ kind: 'max_recent_apps_business', params: { months: 6, max: 1 } }]
      })
    )
    expect(drew.recommended.map((c) => c.label)).toEqual(['Chase Sapphire Preferred'])
    const spark = drew.blocked[0]
    expect(spark.businessName).toBe('Lambda')
    expect(spark.waitUntil).toBe('2026-12-15')
  })

  it('checks min spend against the tracked rate over the offer window', () => {
    const [drew] = recommend(
      base({ rules: [{ kind: 'min_spend_capacity', params: { lookbackMonths: 3, buffer: 1 } }] })
    )
    // Capacity = $2k/mo × 3mo = $6k: CSP ($4k) fits, Spark ($6k) fits exactly.
    expect(drew.recommended).toHaveLength(2)

    const [lean] = recommend(
      base({
        spendEntries: [{ amountCents: 100000, date: '2026-06-20' }], // ~$333/mo
        rules: [{ kind: 'min_spend_capacity', params: { lookbackMonths: 3, buffer: 1 } }]
      })
    )
    expect(lean.recommended).toHaveLength(0)
    expect(lean.blocked[0].blocks[0].reason).toMatch(/exceeds/)
  })

  it('filters small and expired bonuses', () => {
    const [drew] = recommend(
      base({
        offers: [
          { ...CSR, valueCents: 20000 },
          { ...SPARK, expires: '2026-01-01' }
        ],
        rules: [{ kind: 'min_bonus_value', params: { minCents: 30000 } }]
      })
    )
    expect(drew.recommended).toHaveLength(0)
    expect(drew.blocked.find((c) => c.label.includes('Spark'))!.blocks.some((b) => b.kind === 'expired')).toBe(true)
  })

  it('sorts recommendations by ROI on required spend', () => {
    // CSP: $900/$4k = 22.5%; Spark: $1200/$6k = 20%.
    const [drew] = recommend(base())
    expect(drew.recommended.map((c) => c.label)).toEqual([
      'Chase Sapphire Preferred',
      'Capital One Spark Cash Plus'
    ])
    expect(Math.round(drew.recommended[0].roiPct!)).toBe(23)
  })

  it('adds referral value to household ROI only when a saved person owns the link', () => {
    const people = [
      { id: 1, name: 'Drew' },
      { id: 2, name: 'Kathleen' }
    ]
    const kathleensLink = {
      cardProductId: 100,
      url: 'https://refer.example/kathleen',
      source: 'user',
      ownerPersonId: 2,
      ownerName: 'Kathleen'
    }
    const [drew] = recommend(
      base({
        people,
        offers: [{ ...CSR, referralValueCents: 20000 }],
        referralLinks: [kathleensLink]
      })
    )
    const csp = drew.recommended[0]
    expect(csp.referralFrom).toBe('Kathleen')
    expect(csp.referralValueCents).toBe(20000)
    expect(csp.referralLinkUrl).toBe('https://refer.example/kathleen')
    expect(csp.referralLinkSeeded).toBe(false)
    expect(csp.totalValueCents).toBe(110000) // $900 bonus + $200 referral
    expect(Math.round(csp.roiPct!)).toBe(28) // 1100/4000

    // Without any stored link, another person merely holding the card is not enough.
    const [drewNoLink] = recommend(
      base({
        people,
        offers: [{ ...CSR, referralValueCents: 20000 }],
        cards: [
          { id: 50, cardProductId: 100, ownerPersonId: 2, businessId: null, appliedDate: null, openedDate: '2024-01-01', status: 'open' }
        ]
      })
    )
    expect(drewNoLink.recommended[0].referralFrom).toBeNull()
    expect(drewNoLink.recommended[0].totalValueCents).toBe(90000)

    // Kathleen herself can't self-refer through her own link.
    const kathleen = recommend(
      base({ people, offers: [{ ...CSR, referralValueCents: 20000 }], referralLinks: [kathleensLink] })
    )[1]
    const hers = [...kathleen.recommended, ...kathleen.blocked].find((c) => c.label.includes('Sapphire'))!
    expect(hers.referralFrom).toBeNull()
    expect(hers.totalValueCents).toBe(90000)
  })

  it('never counts a link owned by the applicant, even through their business', () => {
    const people = [
      { id: 1, name: 'Drew' },
      { id: 2, name: 'Kathleen' }
    ]
    const businesses = [
      { id: 10, name: 'Lambda', ownerPersonId: 1 },
      { id: 11, name: 'Searchlight', ownerPersonId: 1 }
    ]
    // Drew's Searchlight business owns the Spark referral link (ownerPersonId
    // resolves through the business to Drew).
    const searchlightLink = {
      cardProductId: 200,
      url: 'https://refer.example/searchlight',
      source: 'user',
      ownerPersonId: 1,
      ownerName: 'Searchlight'
    }
    const [drew, kathleen] = recommend(
      base({
        people,
        businesses,
        offers: [{ ...SPARK, referralValueCents: 20000 }],
        referralLinks: [searchlightLink]
      })
    )
    // Drew applying via Lambda: same person behind the link -> no referral value.
    const lambda = [...drew.recommended, ...drew.blocked].find((c) => c.businessName === 'Lambda')!
    expect(lambda.referralFrom).toBeNull()
    // The link still surfaces for applying (someone benefits), just no value.
    expect(lambda.hasReferralLink).toBe(true)
    expect(kathleen.recommended).toHaveLength(0)
  })

  it('lets a different person\'s link refer a business application', () => {
    const people = [
      { id: 1, name: 'Drew' },
      { id: 2, name: 'Kathleen' }
    ]
    const businesses = [{ id: 12, name: 'Kath Sole', ownerPersonId: 2 }]
    const kathleen = recommend(
      base({
        people,
        businesses,
        offers: [{ ...SPARK, referralValueCents: 20000 }],
        referralLinks: [
          { cardProductId: 200, url: 'https://refer.example/drew', source: 'user', ownerPersonId: 1, ownerName: 'Drew' }
        ]
      })
    )[1]
    const cand = [...kathleen.recommended, ...kathleen.blocked].find((c) => c.businessName === 'Kath Sole')!
    expect(cand.referralFrom).toBe('Drew')
    expect(cand.referralValueCents).toBe(20000)
  })

  it('surfaces seeded links without counting their value, and breaks ROI ties toward links', () => {
    const seeded = {
      cardProductId: 100,
      url: 'https://refer.example/app-author',
      source: 'seeded',
      ownerPersonId: null,
      ownerName: null
    }
    // Identical economics; only product 100 has a (seeded) link.
    const TWIN = { ...CSR, id: 9, cardProductId: 900, productName: 'Twin Card' }
    const [drew] = recommend(
      base({
        offers: [TWIN, { ...CSR, referralValueCents: 20000 }],
        referralLinks: [seeded]
      })
    )
    const csp = drew.recommended.find((c) => c.label.includes('Sapphire'))!
    // Seeded link: usable but worth nothing to the household.
    expect(csp.referralValueCents).toBeNull()
    expect(csp.totalValueCents).toBe(90000)
    expect(csp.referralLinkUrl).toBe('https://refer.example/app-author')
    expect(csp.referralLinkSeeded).toBe(true)
    // Equal ROI: the linked product ranks first.
    expect(drew.recommended.map((c) => c.label)).toEqual([
      'Chase Sapphire Preferred',
      'Chase Twin Card'
    ])
  })

  it('nets the first-year annual fee out of value and ROI unless waived', () => {
    const [drew] = recommend(
      base({
        offers: [
          { ...CSR, annualFeeCents: 9500 }, // $900 - $95 = $805 -> 20.1% of $4k
          { ...SPARK, annualFeeCents: 15000, feeWaivedFirstYear: true } // fee ignored
        ]
      })
    )
    const csp = drew.recommended.find((c) => c.label.includes('Sapphire'))!
    expect(csp.totalValueCents).toBe(80500)
    expect(Math.round(csp.roiPct!)).toBe(20)
    const spark = drew.recommended.find((c) => c.label.includes('Spark'))!
    expect(spark.totalValueCents).toBe(120000)
    expect(spark.feeWaivedFirstYear).toBe(true)
  })

  it('counts baseline earn on the required spend in value and ROI', () => {
    const [drew] = recommend(base({ offers: [{ ...CSR, earnPct: 2 }] }))
    const csp = drew.recommended[0]
    // $900 bonus + 2% of $4,000 spend ($80) = $980 -> 24.5%
    expect(csp.earnOnSpendCents).toBe(8000)
    expect(csp.totalValueCents).toBe(98000)
    expect(Math.round(csp.roiPct!)).toBe(25)
  })

  it('blocks everything while open bonus spend exceeds the pace threshold', () => {
    // $6k remaining at $2k/mo = 3 months of open spend >= 2 month threshold.
    const [drew] = recommend(
      base({
        bonuses: [
          { targetSpendCents: 800000, spendSoFarCents: 200000, deadline: null, received: false }
        ],
        rules: [{ kind: 'finish_open_bonuses', params: { maxOpenMonths: 2, lookbackMonths: 3 } }]
      })
    )
    expect(drew.recommended).toHaveLength(0)
    expect(drew.blocked).toHaveLength(2) // household-wide: personal AND business
    const block = drew.blocked[0].blocks[0]
    expect(block.kind).toBe('finish_open_bonuses')
    expect(block.reason).toMatch(/\$6,000 of open bonus spend ≈ 3\.0 mo/)
    // $2k over the threshold clears at $2k/mo -> ~30 days out.
    expect(drew.blocked[0].waitUntil).toBe('2026-08-05')
  })

  it('allows applications when open bonus spend is under the threshold', () => {
    // $3k remaining = 1.5 months at $2k/mo, under the 2 month threshold.
    const [drew] = recommend(
      base({
        bonuses: [
          { targetSpendCents: 400000, spendSoFarCents: 100000, deadline: null, received: false }
        ],
        rules: [{ kind: 'finish_open_bonuses', params: { maxOpenMonths: 2, lookbackMonths: 3 } }]
      })
    )
    expect(drew.recommended).toHaveLength(2)
  })

  it('ignores received and past-deadline bonuses when totalling open spend', () => {
    const [drew] = recommend(
      base({
        bonuses: [
          { targetSpendCents: 800000, spendSoFarCents: 0, deadline: null, received: true },
          { targetSpendCents: 800000, spendSoFarCents: 0, deadline: '2026-06-30', received: false }
        ],
        rules: [{ kind: 'finish_open_bonuses', params: { maxOpenMonths: 2, lookbackMonths: 3 } }]
      })
    )
    expect(drew.recommended).toHaveLength(2)
  })

  it('uses a bonus deadline as waitUntil when it frees capacity before the pace does', () => {
    // $8k remaining needs ~60 days of pace, but the bonus dies on 2026-07-20.
    const [drew] = recommend(
      base({
        bonuses: [
          { targetSpendCents: 800000, spendSoFarCents: 0, deadline: '2026-07-20', received: false }
        ],
        rules: [{ kind: 'finish_open_bonuses', params: { maxOpenMonths: 2, lookbackMonths: 3 } }]
      })
    )
    expect(drew.blocked[0].waitUntil).toBe('2026-07-20')
  })

  it('blocks on open bonuses even with no tracked spend, waiting out deadlines', () => {
    const [drew] = recommend(
      base({
        spendEntries: [],
        bonuses: [
          { targetSpendCents: 100000, spendSoFarCents: 0, deadline: '2026-08-15', received: false }
        ],
        rules: [{ kind: 'finish_open_bonuses', params: { maxOpenMonths: 2, lookbackMonths: 3 } }]
      })
    )
    expect(drew.recommended).toHaveLength(0)
    expect(drew.blocked[0].blocks[0].reason).toMatch(/no tracked spend/)
    expect(drew.blocked[0].waitUntil).toBe('2026-08-15')
  })

  it('ignores unknown rule kinds', () => {
    const [drew] = recommend(base({ rules: [{ kind: 'not_a_rule', params: {} }] }))
    expect(drew.recommended).toHaveLength(2)
  })
})

describe('monthly spend projection', () => {
  it('uses the resolved monthly spend instead of tracked entries when provided', () => {
    // Tracked pace is $2k/mo (base); CSP needs $4k in 3 mo. With a $500/mo
    // projection, capacity is $1.5k and the offer blocks.
    const [drew] = recommend(
      base({
        monthlySpendCents: 50000,
        rules: [{ kind: 'min_spend_capacity', params: { lookbackMonths: 3, buffer: 1 } }]
      })
    )
    const csp = drew.blocked.find((c) => c.label.includes('Sapphire'))!
    expect(csp.blocks[0].kind).toBe('min_spend_capacity')

    // And a generous projection un-blocks everything despite no tracked history.
    const [rich] = recommend(
      base({
        spendEntries: [],
        monthlySpendCents: 1000000,
        rules: [{ kind: 'min_spend_capacity', params: { lookbackMonths: 3, buffer: 1 } }]
      })
    )
    expect(rich.blocked).toHaveLength(0)
  })

  describe('max_recent_apps_issuer (per person, across businesses)', () => {
    const RULE = [{ kind: 'max_recent_apps_issuer', params: { issuer: 'Chase', months: 1, max: 1 } }]
    // Chase Ink applied for under the Lambda business two weeks ago.
    const recentInk = {
      id: 1,
      cardProductId: 500,
      ownerPersonId: 1,
      businessId: 10,
      appliedDate: '2026-06-25',
      openedDate: '2026-06-25',
      status: 'open' as const,
      productName: 'Ink Business Preferred',
      productIssuerName: 'Chase'
    }

    it("a recent Chase business app blocks the person's next Chase card, personal or under another business", () => {
      const [drew] = recommend(base({ cards: [recentInk], rules: RULE }))
      const csp = drew.blocked.find((c) => c.label.includes('Sapphire'))!
      expect(csp.blocks[0].kind).toBe('max_recent_apps_issuer')
      expect(csp.blocks[0].reason).toContain('across personal + businesses')
      expect(csp.blocks[0].waitUntil).toBe('2026-07-25')
      // Non-Chase offers are unaffected.
      expect(drew.recommended.map((c) => c.label)).toEqual(['Capital One Spark Cash Plus'])
    })

    it('stops blocking once the application ages past the window', () => {
      const [drew] = recommend(
        base({ cards: [{ ...recentInk, appliedDate: '2026-05-01', openedDate: '2026-05-01' }], rules: RULE })
      )
      expect(drew.blocked).toHaveLength(0)
    })
  })

  describe('Chase Ink rules (per person, across businesses)', () => {
    const INK_CASH = {
      id: 30,
      cardProductId: 600,
      productName: 'Ink Cash',
      issuerName: 'Chase',
      isBusiness: true,
      valueCents: 75000,
      minSpendCents: 600000,
      windowMonths: 3,
      expires: null
    }
    const INK_UNLIMITED = { ...INK_CASH, id: 31, cardProductId: 601, productName: 'Ink Unlimited' }
    const INK_PREFERRED = { ...INK_CASH, id: 32, cardProductId: 602, productName: 'Ink Preferred' }
    const rich = { spendEntries: [], monthlySpendCents: 10000000 }
    const inkCard = (over: Record<string, unknown>) => ({
      id: 99,
      cardProductId: 600,
      ownerPersonId: 1,
      businessId: 10,
      appliedDate: '2024-01-01',
      openedDate: '2024-01-01',
      status: 'open',
      productName: 'Ink Cash',
      productIssuerName: 'Chase',
      ...over
    })

    it('businessOnly pacing: a business app 2 months ago blocks business offers, not personal ones', () => {
      const RULE = [
        { kind: 'max_recent_apps_issuer', params: { issuer: 'Chase', months: 3, max: 1, businessOnly: true } }
      ]
      const [drew] = recommend(
        base({
          ...rich,
          offers: [CSR, INK_UNLIMITED],
          cards: [inkCard({ appliedDate: '2026-05-05', openedDate: '2026-05-05' })],
          rules: RULE
        })
      )
      const ink = drew.blocked.find((c) => c.label.includes('Ink Unlimited'))!
      expect(ink.blocks[0].kind).toBe('max_recent_apps_issuer')
      expect(ink.blocks[0].reason).toContain('business application')
      expect(ink.blocks[0].waitUntil).toBe('2026-08-05')
      // The personal Sapphire is not paced by the business-only rule.
      expect(drew.recommended.map((c) => c.label)).toContain('Chase Sapphire Preferred')
    })

    it('max_open_matching: 3 open Inks across businesses block the next Ink but not other Chase cards', () => {
      const RULE = [{ kind: 'max_open_matching', params: { issuer: 'Chase', match: ['ink'], max: 3 } }]
      const three = [
        inkCard({ id: 1, businessId: 10 }),
        inkCard({ id: 2, cardProductId: 602, productName: 'Ink Preferred', businessId: 11 }),
        inkCard({ id: 3, cardProductId: 603, productName: 'Ink Premier', businessId: null })
      ]
      const [drew] = recommend(base({ ...rich, offers: [CSR, INK_UNLIMITED], cards: three, rules: RULE }))
      const ink = drew.blocked.find((c) => c.label.includes('Ink Unlimited'))!
      expect(ink.blocks[0].kind).toBe('max_open_matching')
      expect(ink.blocks[0].reason).toContain('close one before applying')
      expect(drew.recommended.map((c) => c.label)).toContain('Chase Sapphire Preferred')
      // Closing one lifts the ceiling.
      const [after] = recommend(
        base({
          ...rich,
          offers: [INK_UNLIMITED],
          cards: [three[0], three[1], { ...three[2], status: 'closed' }],
          rules: RULE
        })
      )
      expect(after.recommended.map((c) => c.label)).toContain('Chase Ink Unlimited')
    })

    it('Nov 2025 bonus rules: any no-AF Ink ever held kills all no-AF Ink bonuses, AF Inks are per exact card', () => {
      const FAMILIES = [
        {
          label: 'Chase Ink (no annual fee)',
          issuer: 'Chase',
          include: ['ink'],
          exclude: ['preferred', 'premier'],
          tiers: ['ink']
        },
        { label: 'Chase Ink Preferred', issuer: 'Chase', include: ['ink', 'preferred'], tiers: ['ink'] }
      ]
      const RULE = [{ kind: 'family_bonus_order', params: { families: FAMILIES } }]
      // Ink Cash closed years ago (even under another business).
      const [drew] = recommend(
        base({
          ...rich,
          offers: [INK_UNLIMITED, INK_PREFERRED],
          cards: [inkCard({ status: 'closed' })],
          rules: RULE
        })
      )
      const unlimited = drew.blocked.find((c) => c.label.includes('Ink Unlimited'))!
      expect(unlimited.blocks[0].kind).toBe('family_bonus_order')
      expect(unlimited.blocks[0].reason).toContain('already had Ink Cash')
      // The annual-fee Preferred is its own group — still winnable.
      expect(drew.recommended.map((c) => c.label)).toContain('Chase Ink Preferred')
    })
  })

  describe('family_bonus_order (Amex family rules)', () => {
    const AMEX_GOLD = {
      id: 20,
      cardProductId: 300,
      productName: 'Gold',
      issuerName: 'American Express',
      isBusiness: false,
      valueCents: 60000,
      minSpendCents: 600000,
      windowMonths: 6,
      expires: null
    }
    const AMEX_PLATINUM = {
      id: 21,
      cardProductId: 301,
      productName: 'Platinum',
      issuerName: 'American Express',
      isBusiness: false,
      valueCents: 150000,
      minSpendCents: 800000,
      windowMonths: 6,
      expires: null
    }
    const SCHWAB_PLATINUM = {
      id: 22,
      cardProductId: 302,
      productName: 'Platinum for Schwab',
      issuerName: 'American Express',
      isBusiness: false,
      valueCents: 150000,
      minSpendCents: 800000,
      windowMonths: 6,
      expires: null
    }
    const DELTA_GOLD = {
      id: 23,
      cardProductId: 303,
      productName: 'Delta SkyMiles Gold',
      issuerName: 'American Express',
      isBusiness: false,
      valueCents: 50000,
      minSpendCents: 200000,
      windowMonths: 6,
      expires: null
    }
    const RULE = [{ kind: 'family_bonus_order', params: {} }]
    const rich = { spendEntries: [], monthlySpendCents: 10000000 }

    it('blocks Platinum while the Gold bonus is still collectable', () => {
      const [drew] = recommend(
        base({ ...rich, offers: [AMEX_GOLD, AMEX_PLATINUM, SCHWAB_PLATINUM], rules: RULE })
      )
      expect(drew.recommended.map((c) => c.label)).toEqual(['American Express Gold'])
      const plat = drew.blocked.find((c) => c.label === 'American Express Platinum')!
      expect(plat.blocks[0].kind).toBe('family_bonus_order')
      expect(plat.blocks[0].reason).toContain('forfeits the Gold bonus')
      // Schwab Platinum is a Platinum variant — same tier, same block.
      const schwab = drew.blocked.find((c) => c.label.includes('Schwab'))!
      expect(schwab.blocks[0].kind).toBe('family_bonus_order')
    })

    it('unblocks Platinum once Gold was applied for, even if since closed', () => {
      const [drew] = recommend(
        base({
          ...rich,
          offers: [AMEX_PLATINUM],
          cards: [
            {
              id: 1,
              cardProductId: 300,
              ownerPersonId: 1,
              businessId: null,
              appliedDate: '2025-01-01',
              openedDate: '2025-01-01',
              status: 'closed',
              productName: 'Gold',
              productIssuerName: 'American Express'
            }
          ],
          rules: RULE
        })
      )
      expect(drew.recommended.map((c) => c.label)).toEqual(['American Express Platinum'])
    })

    it('blocks the Gold bonus — and sibling Platinum variants — once any Platinum was held', () => {
      const [drew] = recommend(
        base({
          ...rich,
          offers: [AMEX_GOLD, AMEX_PLATINUM],
          cards: [
            {
              id: 1,
              cardProductId: 302,
              ownerPersonId: 1,
              businessId: null,
              appliedDate: '2024-01-01',
              openedDate: '2024-01-01',
              status: 'open',
              productName: 'Platinum for Schwab',
              productIssuerName: 'American Express'
            }
          ],
          rules: RULE
        })
      )
      const gold = drew.blocked.find((c) => c.label === 'American Express Gold')!
      expect(gold.blocks[0].kind).toBe('family_bonus_order')
      expect(gold.blocks[0].reason).toContain('already had Platinum for Schwab')
      // Same-tier sibling: vanilla Platinum's bonus is also gone.
      const plat = drew.blocked.find((c) => c.label === 'American Express Platinum')!
      expect(plat.blocks[0].kind).toBe('family_bonus_order')
    })

    it('treats Delta as its own family: MR Platinum held does not touch Delta Gold, and vice versa', () => {
      const [drew] = recommend(
        base({
          ...rich,
          offers: [DELTA_GOLD, AMEX_PLATINUM],
          cards: [
            {
              id: 1,
              cardProductId: 301,
              ownerPersonId: 1,
              businessId: null,
              appliedDate: '2024-01-01',
              openedDate: '2024-01-01',
              status: 'open',
              productName: 'Platinum',
              productIssuerName: 'American Express'
            }
          ],
          rules: RULE
        })
      )
      // Delta Gold is unaffected by the MR-family Platinum; re-applying for
      // Platinum itself is blocked (once held, its bonus is gone for good).
      expect(drew.recommended.map((c) => c.label)).toEqual([
        'American Express Delta SkyMiles Gold'
      ])
      const plat = drew.blocked.find((c) => c.label === 'American Express Platinum')!
      expect(plat.blocks[0].kind).toBe('family_bonus_order')
      expect(plat.blocks[0].reason).toContain('already had Platinum')
    })

    it('orders Delta tiers within the Delta family', () => {
      const DELTA_PLATINUM = {
        ...DELTA_GOLD,
        id: 24,
        cardProductId: 304,
        productName: 'Delta SkyMiles Platinum'
      }
      // Platinum blocked while the Delta Gold bonus is collectable…
      const [before] = recommend(base({ ...rich, offers: [DELTA_GOLD, DELTA_PLATINUM], rules: RULE }))
      const plat = before.blocked.find((c) => c.label.includes('Delta SkyMiles Platinum'))!
      expect(plat.blocks[0].kind).toBe('family_bonus_order')
      // …and Delta Gold is dead once the Reserve was held.
      const [after] = recommend(
        base({
          ...rich,
          offers: [DELTA_GOLD],
          cards: [
            {
              id: 1,
              cardProductId: 305,
              ownerPersonId: 1,
              businessId: null,
              appliedDate: '2025-06-01',
              openedDate: '2025-06-01',
              status: 'open',
              productName: 'Delta SkyMiles Reserve',
              productIssuerName: 'American Express'
            }
          ],
          rules: RULE
        })
      )
      const gold = after.blocked.find((c) => c.label.includes('Delta SkyMiles Gold'))!
      expect(gold.blocks[0].kind).toBe('family_bonus_order')
      expect(gold.blocks[0].reason).toContain('already had Delta SkyMiles Reserve')
    })

    it('does not misread a rejected application or another issuer\'s "Platinum" as family history', () => {
      const [drew] = recommend(
        base({
          ...rich,
          offers: [AMEX_GOLD],
          cards: [
            {
              id: 1,
              cardProductId: 301,
              ownerPersonId: 1,
              businessId: null,
              appliedDate: '2024-01-01',
              openedDate: null,
              status: 'rejected',
              productName: 'Platinum',
              productIssuerName: 'American Express'
            },
            {
              id: 2,
              cardProductId: 900,
              ownerPersonId: 1,
              businessId: null,
              appliedDate: null,
              openedDate: '2023-01-01',
              status: 'open',
              productName: 'Platinum Rewards Visa',
              productIssuerName: 'Wells Fargo'
            }
          ],
          rules: RULE
        })
      )
      expect(drew.recommended.map((c) => c.label)).toEqual(['American Express Gold'])
    })
  })
})
