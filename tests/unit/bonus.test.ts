import { describe, it, expect } from 'vitest'
import { bonusRemainingCents, computeBonus, isBonusOpen } from '../../src/main/domain/bonus'

describe('computeBonus', () => {
  it('values a points bonus at points × cpp and tracks remaining spend', () => {
    const computed = computeBonus(
      { pointsAmount: 60000, targetSpendCents: 400000, spendSoFarCents: 250000 },
      1.5
    )
    expect(computed.valueCents).toBe(90000)
    expect(computed.remainingSpendCents).toBe(150000)
    expect(computed.spendMet).toBe(false)
  })

  it('uses explicit cash value directly, ignoring cpp', () => {
    const computed = computeBonus(
      { cashAmountCents: 75000, targetSpendCents: 300000, spendSoFarCents: 300000 },
      null
    )
    expect(computed.valueCents).toBe(75000)
    expect(computed.spendMet).toBe(true)
  })

  it('returns null value when points have no program valuation', () => {
    const computed = computeBonus({ pointsAmount: 60000 }, null)
    expect(computed.valueCents).toBeNull()
  })

  it('handles a missing spend target', () => {
    const computed = computeBonus({ pointsAmount: 10000, spendSoFarCents: 5000 }, 1)
    expect(computed.remainingSpendCents).toBeNull()
    expect(computed.spendMet).toBe(false)
  })

  it('clamps remaining spend at zero once past the target', () => {
    const computed = computeBonus({ targetSpendCents: 100000, spendSoFarCents: 150000 }, null)
    expect(computed.remainingSpendCents).toBe(0)
    expect(computed.spendMet).toBe(true)
  })
})

describe('computeBonus pace', () => {
  // Halfway through a 90-day window.
  const today = new Date('2026-02-15T00:00:00')
  const window = {
    card: { openedDate: '2026-01-01' },
    deadline: '2026-04-01',
    targetSpendCents: 400000
  }

  it('reports met once the target is reached, regardless of dates', () => {
    expect(computeBonus({ ...window, spendSoFarCents: 400000 }, null, today).pace).toBe('met')
  })

  it('reports on_track when spend keeps up with elapsed time', () => {
    expect(computeBonus({ ...window, spendSoFarCents: 220000 }, null, today).pace).toBe('on_track')
  })

  it('reports behind when spend lags elapsed time', () => {
    expect(computeBonus({ ...window, spendSoFarCents: 100000 }, null, today).pace).toBe('behind')
  })

  it('reports overdue past the deadline without meeting the target', () => {
    const late = new Date('2026-04-02T00:00:00')
    expect(computeBonus({ ...window, spendSoFarCents: 100000 }, null, late).pace).toBe('overdue')
  })

  it('reports unknown without a target, deadline, or card open date', () => {
    expect(computeBonus({ spendSoFarCents: 0 }, null, today).pace).toBe('unknown')
    expect(
      computeBonus({ targetSpendCents: 400000, spendSoFarCents: 0 }, null, today).pace
    ).toBe('unknown')
    expect(
      computeBonus(
        { targetSpendCents: 400000, deadline: '2026-04-01', spendSoFarCents: 0 },
        null,
        today
      ).pace
    ).toBe('unknown')
  })
})

describe('isBonusOpen / bonusRemainingCents', () => {
  const TODAY = '2026-07-06'

  it('remaining clamps at zero and is null without a target', () => {
    expect(bonusRemainingCents({ targetSpendCents: 400000, spendSoFarCents: 100000 })).toBe(300000)
    expect(bonusRemainingCents({ targetSpendCents: 400000, spendSoFarCents: 500000 })).toBe(0)
    expect(bonusRemainingCents({ targetSpendCents: null, spendSoFarCents: 100000 })).toBeNull()
  })

  it('open = unreceived, unmet, deadline (when checked) not passed', () => {
    const b = { received: false, targetSpendCents: 400000, spendSoFarCents: 100000 }
    expect(isBonusOpen(b, TODAY)).toBe(true)
    expect(isBonusOpen({ ...b, received: true }, TODAY)).toBe(false)
    expect(isBonusOpen({ ...b, spendSoFarCents: 400000 }, TODAY)).toBe(false)
    expect(isBonusOpen({ ...b, deadline: '2026-06-30' }, TODAY)).toBe(false)
    expect(isBonusOpen({ ...b, deadline: '2026-07-06' }, TODAY)).toBe(true)
    // Without today, deadlines are not evaluated.
    expect(isBonusOpen({ ...b, deadline: '2026-06-30' })).toBe(true)
  })

  it('a null-target bonus stays open until received', () => {
    expect(isBonusOpen({ received: false, targetSpendCents: null, spendSoFarCents: 999999 }, TODAY)).toBe(true)
    expect(isBonusOpen({ received: true, targetSpendCents: null, spendSoFarCents: 0 }, TODAY)).toBe(false)
  })
})
