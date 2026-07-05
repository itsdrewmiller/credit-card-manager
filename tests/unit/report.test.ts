import { describe, it, expect } from 'vitest'
import { buildReport } from '../../src/main/domain/report'

const empty = { spendEntries: [], bonuses: [], referrals: [], benefits: [] }

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
