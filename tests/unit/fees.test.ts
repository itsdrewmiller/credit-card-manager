import { describe, it, expect } from 'vitest'
import { nextFeeRenewal } from '../../src/main/domain/fees'

describe('nextFeeRenewal', () => {
  it('first renewal lands 13 months after opening (fee model: open + 1mo + 12n)', () => {
    const r = nextFeeRenewal(
      { status: 'open', annualFeeCents: 9500, openedDate: '2025-08-15' },
      '2026-07-06'
    )
    expect(r).toEqual({ renewalDate: '2026-09-15', daysUntil: 71, feeCents: 9500 })
  })

  it('steps past already-charged renewals to the next future one', () => {
    const r = nextFeeRenewal(
      { status: 'open', annualFeeCents: 9500, openedDate: '2023-06-20' },
      '2026-07-06'
    )
    expect(r?.renewalDate).toBe('2026-07-20')
    expect(r?.daysUntil).toBe(14)
  })

  it('ignores closed, fee-free, and unopened cards', () => {
    const today = '2026-07-06'
    expect(nextFeeRenewal({ status: 'closed', annualFeeCents: 9500, openedDate: '2025-08-15' }, today)).toBeNull()
    expect(nextFeeRenewal({ status: 'open', annualFeeCents: 0, openedDate: '2025-08-15' }, today)).toBeNull()
    expect(nextFeeRenewal({ status: 'open', annualFeeCents: null, openedDate: '2025-08-15' }, today)).toBeNull()
    expect(nextFeeRenewal({ status: 'open', annualFeeCents: 9500, openedDate: null }, today)).toBeNull()
  })
})
