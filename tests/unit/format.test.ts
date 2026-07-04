import { describe, it, expect } from 'vitest'
import {
  formatCents,
  parseCents,
  centsToDollars,
  formatPoints,
  pointsValueCents,
  bonusValueCents,
  formatDate,
  daysUntil,
  isoMonthsAgo,
  toIsoDate,
  addDays,
  daysBetween
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
})

describe('dates', () => {
  it('formats ISO dates for display', () => {
    expect(formatDate('2026-06-18')).toBe('Jun 18, 2026')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('garbage')).toBe('garbage')
  })

  it('computes days until a date (negative = past)', () => {
    const today = new Date('2026-06-18T12:00:00')
    expect(daysUntil('2026-06-20', today)).toBe(2)
    expect(daysUntil('2026-06-18', today)).toBe(0)
    expect(daysUntil('2026-06-10', today)).toBe(-8)
    expect(daysUntil(null, today)).toBeNull()
  })

  it('computes ISO dates n months ago', () => {
    expect(isoMonthsAgo(24, new Date(2026, 5, 18))).toBe('2026-06-18'.replace('2026', '2024'))
  })

  it('converts Date to ISO', () => {
    expect(toIsoDate(new Date('2026-06-18T00:00:00Z'))).toBe('2026-06-18')
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate(new Date('garbage'))).toBeNull()
  })

  it('adds days null-safely', () => {
    expect(addDays(new Date(2026, 0, 15), 90)).toEqual(new Date(2026, 3, 15))
    expect(addDays(null, 90)).toBeNull()
    expect(addDays(new Date(), null)).toBeNull()
  })

  it('computes whole days between dates, null on missing or negative spans', () => {
    expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 31))).toBe(30)
    expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 1))).toBe(0)
    expect(daysBetween(new Date(2026, 0, 31), new Date(2026, 0, 1))).toBeNull()
    expect(daysBetween(null, new Date())).toBeNull()
  })
})
