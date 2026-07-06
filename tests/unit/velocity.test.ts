import { describe, it, expect } from 'vitest'
import { personVelocity } from '../../src/main/domain/velocity'

const now = new Date('2026-06-18T00:00:00')

describe('personVelocity', () => {
  it('counts only personal cards opened in the trailing 24 months', () => {
    const v = personVelocity(
      [
        { id: 1, openedDate: '2026-01-10', businessId: null, status: 'open' }, // counts
        { id: 2, openedDate: '2025-06-01', businessId: null, status: 'closed' }, // counts (opened, now closed)
        { id: 3, openedDate: '2025-03-01', businessId: 7, status: 'open' }, // business -> excluded
        { id: 4, openedDate: '2023-01-01', businessId: null, status: 'open' }, // >24mo -> excluded
        { id: 5, openedDate: null, businessId: null, status: 'applied' } // never opened -> excluded
      ],
      now
    )
    expect(v.count).toBe(2)
    expect(v.atChase524).toBe(false)
    expect(v.contributing.map((c) => c.id)).toEqual([1, 2])
  })

  it('frees the next slot 24 months after the oldest contributing card', () => {
    const v = personVelocity(
      [
        { id: 1, openedDate: '2026-01-10', businessId: null, status: 'open' },
        { id: 2, openedDate: '2025-06-01', businessId: null, status: 'closed' }
      ],
      now
    )
    expect(v.nextFreeDate).toBe('2027-06-01')
  })

  it('counts business cards marked as reporting to the personal bureau', () => {
    const v = personVelocity(
      [
        { id: 1, openedDate: '2026-01-10', businessId: null, status: 'open' },
        { id: 2, openedDate: '2025-06-01', businessId: 7, reportsToPersonal: true, status: 'open' }, // counts
        { id: 3, openedDate: '2025-03-01', businessId: 7, reportsToPersonal: false, status: 'open' } // excluded
      ],
      now
    )
    expect(v.count).toBe(2)
    expect(v.contributing.map((c) => c.id)).toEqual([1, 2])
  })

  it('reports when an over-5/24 person gets back under', () => {
    const v = personVelocity(
      [
        { id: 1, openedDate: '2026-02-01', businessId: null, status: 'open' },
        { id: 2, openedDate: '2026-01-01', businessId: null, status: 'open' },
        { id: 3, openedDate: '2025-12-01', businessId: null, status: 'open' },
        { id: 4, openedDate: '2025-06-01', businessId: null, status: 'open' },
        { id: 5, openedDate: '2025-03-01', businessId: null, status: 'open' },
        { id: 6, openedDate: '2024-09-01', businessId: null, status: 'open' }
      ],
      now
    )
    expect(v.count).toBe(6)
    expect(v.atChase524).toBe(true)
    // Six counting: two must age out. Second-oldest opened 2025-03-01 -> under on 2027-03-01.
    expect(v.under524Date).toBe('2027-03-01')

    const five = personVelocity(
      Array.from({ length: 5 }, (_, i) => ({
        id: i,
        openedDate: i === 4 ? '2025-03-01' : '2026-02-01',
        businessId: null,
        status: 'open'
      })),
      now
    )
    // Exactly five: under as soon as the oldest ages out.
    expect(five.under524Date).toBe('2027-03-01')
    expect(five.nextFreeDate).toBe('2027-03-01')
  })

  it('flags 5/24 at five personal cards in 24 months', () => {
    const heavy = personVelocity(
      Array.from({ length: 5 }, (_, i) => ({
        id: i,
        openedDate: '2026-02-01',
        businessId: null,
        status: 'open'
      })),
      now
    )
    expect(heavy.atChase524).toBe(true)
  })

  it('returns an empty result with no cards', () => {
    const v = personVelocity([], now)
    expect(v.count).toBe(0)
    expect(v.nextFreeDate).toBeNull()
    expect(v.atChase524).toBe(false)
    expect(v.under524Date).toBeNull()
  })
})
