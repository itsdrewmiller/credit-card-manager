import { describe, it, expect } from 'vitest'
import {
  formatCents,
  parseCents,
  centsToDollars,
  formatPoints,
  pointsValueCents,
  bonusValueCents,
  offerValueCents
} from '../../src/shared/format'

describe('formatCents / parseCents', () => {
  it('formats integer cents as USD', () => {
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(null)).toBe('—')
  })

  it('parses dollar strings and numbers to cents', () => {
    expect(parseCents('$1,234.56')).toBe(123456)
    expect(parseCents('1234.56')).toBe(123456)
    expect(parseCents(1234.56)).toBe(123456)
    expect(parseCents('')).toBeNull()
    expect(parseCents(null)).toBeNull()
    expect(parseCents('not a number')).toBeNull()
  })

  it('round-trips through centsToDollars', () => {
    expect(centsToDollars(123456)).toBe(1234.56)
    expect(centsToDollars(null)).toBe('')
    expect(parseCents(centsToDollars(9999))).toBe(9999)
  })
})

describe('points and bonus values', () => {
  it('formats points with separators', () => {
    expect(formatPoints(60000)).toBe('60,000')
    expect(formatPoints(null)).toBe('—')
  })

  it('values points at cpp', () => {
    expect(pointsValueCents(60000, 1.5)).toBe(90000)
    expect(pointsValueCents(60000, null)).toBeNull()
    expect(pointsValueCents(null, 1.5)).toBeNull()
  })

  it('prefers explicit cash over points in bonusValueCents', () => {
    expect(bonusValueCents({ cashAmountCents: 75000, pointsAmount: 60000, valuationCpp: 1.5 })).toBe(75000)
    expect(bonusValueCents({ pointsAmount: 60000, valuationCpp: 1.5 })).toBe(90000)
    expect(bonusValueCents({})).toBeNull()
  })

  it('values offers with the feed cpp as fallback for untracked programs', () => {
    expect(offerValueCents({ cashAmountCents: 75000, pointsAmount: 60000, pointValueCpp: 1.25 })).toBe(75000)
    // Your program valuation wins over the feed estimate.
    expect(
      offerValueCents({ pointsAmount: 60000, pointValueCpp: 1.25, pointProgram: { valuationCpp: 1.5 } })
    ).toBe(90000)
    expect(offerValueCents({ pointsAmount: 60000, pointValueCpp: 1.25 })).toBe(75000)
    expect(offerValueCents({ pointsAmount: 60000 })).toBeNull()
  })
})
