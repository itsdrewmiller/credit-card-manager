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
