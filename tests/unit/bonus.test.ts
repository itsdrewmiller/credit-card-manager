import { describe, it, expect } from 'vitest'
import { computeBonus } from '../../src/main/domain/bonus'

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
