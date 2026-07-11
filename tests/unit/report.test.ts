import { describe, it, expect } from 'vitest'
import { buildReport } from '../../src/main/domain/report'

const empty = { spendEntries: [], bonuses: [], referrals: [], benefits: [], cards: [] }

describe('buildReport', () => {
  it('returns an empty report with no activity', () => {
    const r = buildReport(empty)
    expect(r.months).toEqual([])
    expect(r.totals.spendCents).toBe(0)
    expect(r.totals.returnOnSpend).toBeNull()
  })

  it('buckets spend entries by month, including negative corrections', () => {
    const r = buildReport({
      ...empty,
      spendEntries: [
        { amountCents: 100000, date: '2026-01-05' },
        { amountCents: 50000, date: '2026-01-20' },
        { amountCents: -20000, date: '2026-02-01' }
      ]
    })
    expect(r.months.map((m) => [m.month, m.spendCents])).toEqual([
      ['2026-01', 150000],
      ['2026-02', -20000]
    ])
    expect(r.totals.spendCents).toBe(130000)
  })

  it('counts bonus value in the month received, cash or points × cpp', () => {
    const r = buildReport({
      ...empty,
      bonuses: [
        {
          received: true,
          receivedDate: '2026-03-10',
          cashAmountCents: null,
          pointsAmount: 60000,
          valuationCpp: 1.5
        },
        {
          received: true,
          receivedDate: '2026-03-20',
          cashAmountCents: 20000,
          pointsAmount: null,
          valuationCpp: null
        },
        // Not yet received / no date -> excluded
        { received: false, receivedDate: null, cashAmountCents: 50000, pointsAmount: null, valuationCpp: null },
        { received: true, receivedDate: null, cashAmountCents: 50000, pointsAmount: null, valuationCpp: null }
      ]
    })
    expect(r.months).toHaveLength(1)
    expect(r.months[0].bonusReturnCents).toBe(110000)
  })

  it('counts partial benefit use at the consumed amount', () => {
    const r = buildReport({
      ...empty,
      benefits: [
        // $65 of a $150 StubHub credit at 90% -> $58.50
        { used: false, usedDate: '2026-07-01', amountCents: 15000, usedAmountCents: 6500, valuePct: 90 },
        // fully used with an explicit partial amount -> the amount wins
        { used: true, usedDate: '2026-07-02', amountCents: 15000, usedAmountCents: 14000, valuePct: null },
        // partial amount but never dated -> excluded
        { used: false, usedDate: null, amountCents: 15000, usedAmountCents: 6500, valuePct: null }
      ]
    })
    expect(r.months[0].benefitReturnCents).toBe(5850 + 14000)
  })

  it('discounts benefit return by the personal value percent', () => {
    const r = buildReport({
      ...empty,
      benefits: [
        { used: true, usedDate: '2026-05-01', amountCents: 20900, valuePct: 5 }, // Clear at 5%
        { used: true, usedDate: '2026-05-02', amountCents: 10000, valuePct: null } // full face
      ]
    })
    expect(r.months[0].benefitReturnCents).toBe(1045 + 10000)
  })

  it('counts paid referrals and used benefits on their dates', () => {
    const r = buildReport({
      ...empty,
      referrals: [
        { status: 'paid', date: '2026-04-01', rewardValueCents: 20000 },
        { status: 'pending', date: '2026-04-01', rewardValueCents: 20000 }, // excluded
        { status: 'paid', date: null, rewardValueCents: 20000 } // undated -> excluded
      ],
      benefits: [
        { used: true, usedDate: '2026-04-15', amountCents: 30000 },
        { used: false, usedDate: null, amountCents: 30000 } // excluded
      ]
    })
    expect(r.months[0].referralReturnCents).toBe(20000)
    expect(r.months[0].benefitReturnCents).toBe(30000)
    expect(r.months[0].returnCents).toBe(50000)
  })

  it('fills gap months and computes overall return on spend', () => {
    const r = buildReport({
      ...empty,
      spendEntries: [{ amountCents: 400000, date: '2026-01-15' }],
      bonuses: [
        {
          received: true,
          receivedDate: '2026-04-01',
          cashAmountCents: 100000,
          pointsAmount: null,
          valuationCpp: null
        }
      ]
    })
    expect(r.months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(r.months[1].spendCents).toBe(0)
    expect(r.totals.returnOnSpend).toBeCloseTo(0.25)
  })

  it('adds baseline cash back on spend entries carrying an earn rate', () => {
    const r = buildReport({
      ...empty,
      spendEntries: [
        { amountCents: 100000, date: '2026-01-05', cashbackPct: 2 },
        { amountCents: 50000, date: '2026-01-20', cashbackPct: null }, // no rate -> no cash back
        { amountCents: -10000, date: '2026-01-25', cashbackPct: 2 } // corrections claw back
      ]
    })
    expect(r.months[0].spendCents).toBe(140000)
    expect(r.months[0].cashbackReturnCents).toBe(1800) // (1000 - 100) * 2%
    expect(r.months[0].returnCents).toBe(1800)
    expect(r.totals.returnOnSpend).toBeCloseTo(1800 / 140000)
  })

  it('charges annual fees a month after opening, then every anniversary', () => {
    const r = buildReport(
      {
        ...empty,
        cards: [{ annualFeeCents: 9500, openedDate: '2024-03-10', closedDate: null }]
      },
      '2026-07-06'
    )
    const feeMonths = r.months.filter((m) => m.feeCents > 0).map((m) => [m.month, m.feeCents])
    expect(feeMonths).toEqual([
      ['2024-04', 9500],
      ['2025-04', 9500],
      ['2026-04', 9500]
    ])
    expect(r.totals.feeCents).toBe(28500)
    expect(r.totals.returnCents).toBe(-28500)
  })

  it('stops charging fees at closedDate and skips fee-free or unopened cards', () => {
    const r = buildReport(
      {
        ...empty,
        cards: [
          { annualFeeCents: 9500, openedDate: '2024-03-10', closedDate: '2025-06-01' },
          { annualFeeCents: 0, openedDate: '2024-03-10', closedDate: null },
          { annualFeeCents: null, openedDate: '2024-03-10', closedDate: null },
          { annualFeeCents: 9500, openedDate: null, closedDate: null }
        ]
      },
      '2026-07-06'
    )
    expect(r.totals.feeCents).toBe(19000) // 2024-04 and 2025-04 only
  })

  it('subtracts fees from monthly and overall return', () => {
    const r = buildReport(
      {
        ...empty,
        spendEntries: [{ amountCents: 100000, date: '2026-04-05', cashbackPct: 2 }],
        cards: [{ annualFeeCents: 9500, openedDate: '2026-03-10', closedDate: null }]
      },
      '2026-07-06'
    )
    const april = r.months.find((m) => m.month === '2026-04')
    expect(april?.feeCents).toBe(9500)
    expect(april?.returnCents).toBe(2000 - 9500)
    expect(r.totals.returnOnSpend).toBeCloseTo((2000 - 9500) / 100000)
  })

  it('scopes the report to the year the first tracked bonus starts', () => {
    const r = buildReport(
      {
        ...empty,
        spendEntries: [
          { amountCents: 50000, date: '2025-11-01' }, // before scope -> dropped
          { amountCents: 100000, date: '2026-06-01' }
        ],
        bonuses: [
          {
            received: false,
            receivedDate: null,
            cardOpenedDate: '2026-05-24',
            cashAmountCents: 50000,
            pointsAmount: null,
            valuationCpp: null
          }
        ],
        // Fee charges 2024-04, 2025-04, 2026-04 — only the 2026 one is in scope.
        cards: [{ annualFeeCents: 9500, openedDate: '2024-03-10', closedDate: null }]
      },
      '2026-07-06'
    )
    expect(r.months[0].month).toBe('2026-04')
    expect(r.totals.spendCents).toBe(100000)
    expect(r.totals.feeCents).toBe(9500)
  })

  it('crosses year boundaries when filling months', () => {
    const r = buildReport({
      ...empty,
      spendEntries: [
        { amountCents: 1, date: '2025-11-30' },
        { amountCents: 1, date: '2026-02-01' }
      ]
    })
    expect(r.months.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})
