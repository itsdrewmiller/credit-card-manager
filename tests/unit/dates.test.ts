import { describe, it, expect } from 'vitest'
import {
  toIsoDate,
  dateToIso,
  isoToDate,
  todayIso,
  addMonthsIso,
  monthsAgoIso,
  formatDate,
  daysUntil,
  addDays,
  daysBetween
} from '../../src/shared/dates'

describe('Date <-> ISO bridges (local time)', () => {
  it('serializes local calendar dates regardless of timezone', () => {
    expect(toIsoDate(new Date(2026, 5, 18))).toBe('2026-06-18')
    // Late evening local must not roll to the next UTC day.
    expect(toIsoDate(new Date(2026, 5, 18, 23, 30))).toBe('2026-06-18')
  })

  it('dateToIso is the null-tolerant form bridge', () => {
    expect(dateToIso(new Date(2026, 5, 18))).toBe('2026-06-18')
    expect(dateToIso(null)).toBeNull()
    expect(dateToIso(new Date('garbage'))).toBeNull()
  })

  it('isoToDate parses to local midnight and round-trips', () => {
    const d = isoToDate('2026-06-18')!
    expect(d.getHours()).toBe(0)
    expect(toIsoDate(d)).toBe('2026-06-18')
    expect(isoToDate(null)).toBeNull()
    expect(isoToDate('garbage')).toBeNull()
  })

  it('todayIso uses the local calendar day', () => {
    expect(todayIso(new Date(2026, 5, 18, 23, 59))).toBe('2026-06-18')
  })
})

describe('addMonthsIso / monthsAgoIso', () => {
  it('adds months with day clamped to real month ends', () => {
    expect(addMonthsIso('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsIso('2024-01-31', 1)).toBe('2024-02-29') // leap year
  })

  it('keeps month-end dates at month-end', () => {
    expect(addMonthsIso('2026-04-30', 1)).toBe('2026-05-31')
    expect(addMonthsIso('2026-02-28', 12)).toBe('2027-02-28')
  })

  it('crosses year boundaries in both directions', () => {
    expect(addMonthsIso('2025-01-15', 24)).toBe('2027-01-15')
    expect(addMonthsIso('2026-02-15', -3)).toBe('2025-11-15')
  })

  it('computes n months ago from a Date', () => {
    expect(monthsAgoIso(24, new Date(2026, 5, 18))).toBe('2024-06-18')
    expect(monthsAgoIso(3, new Date(2026, 6, 6))).toBe('2026-04-06')
  })
})

describe('display + day math', () => {
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
