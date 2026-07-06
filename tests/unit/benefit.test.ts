import { describe, it, expect } from 'vitest'
import { applyUsedStamp, benefitStatus, sweptOnClose } from '../../src/main/domain/benefit'

const at = new Date('2026-06-18T00:00:00')

describe('benefitStatus', () => {
  it('reports used regardless of dates', () => {
    expect(benefitStatus({ used: true, useBy: '2026-12-31' }, at)).toBe('used')
    expect(benefitStatus({ used: true, useBy: '2026-01-01' }, at)).toBe('used')
  })

  it('reports expired past the use-by date', () => {
    expect(benefitStatus({ useBy: '2026-01-01' }, at)).toBe('expired')
  })

  it('reports upcoming before the use-after date', () => {
    expect(benefitStatus({ useAfter: '2026-09-01', useBy: '2026-12-31' }, at)).toBe('upcoming')
  })

  it('reports available inside the window', () => {
    expect(benefitStatus({ useAfter: '2026-01-01', useBy: '2026-12-31' }, at)).toBe('available')
  })

  it('reports available with no dates at all', () => {
    expect(benefitStatus({}, at)).toBe('available')
  })
})

const TODAY = '2026-07-06'
const fresh = { used: false, usedDate: null, usedAmountCents: null }

describe('applyUsedStamp', () => {
  it('stamps first use when the flag flips on', () => {
    expect(applyUsedStamp(fresh, { used: true }, TODAY)).toEqual({
      used: true,
      usedDate: TODAY,
      usedAmountCents: null
    })
  })

  it('keeps the original first-use date on later edits', () => {
    const current = { used: true, usedDate: '2026-06-01', usedAmountCents: null }
    expect(applyUsedStamp(current, { used: true }, TODAY).usedDate).toBe('2026-06-01')
  })

  it('stamps on a partial amount and keeps the date while any use remains', () => {
    const partial = applyUsedStamp(fresh, { usedAmountCents: 6500 }, TODAY)
    expect(partial).toEqual({ used: false, usedDate: TODAY, usedAmountCents: 6500 })
    // Unchecking "used" while a partial amount remains keeps the date.
    const current = { used: true, usedDate: '2026-06-01', usedAmountCents: 6500 }
    expect(applyUsedStamp(current, { used: false }, TODAY)).toEqual({
      used: false,
      usedDate: '2026-06-01',
      usedAmountCents: 6500
    })
  })

  it('clears the date only when no use remains', () => {
    const current = { used: true, usedDate: '2026-06-01', usedAmountCents: 6500 }
    expect(applyUsedStamp(current, { used: false, usedAmountCents: null }, TODAY)).toEqual(fresh)
  })

  it('normalizes non-positive partial amounts to null', () => {
    expect(applyUsedStamp(fresh, { usedAmountCents: 0 }, TODAY).usedAmountCents).toBeNull()
    expect(applyUsedStamp(fresh, { usedAmountCents: -100 }, TODAY).usedAmountCents).toBeNull()
  })

  it('lets an explicit usedDate win', () => {
    expect(applyUsedStamp(fresh, { used: true, usedDate: '2026-05-05' }, TODAY).usedDate).toBe(
      '2026-05-05'
    )
  })
})

describe('sweptOnClose', () => {
  it('sweeps pending benefits: unused, unspent, window still open', () => {
    expect(sweptOnClose({ used: false, usedAmountCents: null, useBy: '2026-12-31' }, TODAY)).toBe(true)
    expect(sweptOnClose({ used: false, usedAmountCents: null, useBy: null }, TODAY)).toBe(true)
  })

  it('keeps used, partially used, and expired benefits as history', () => {
    expect(sweptOnClose({ used: true, usedAmountCents: null, useBy: '2026-12-31' }, TODAY)).toBe(false)
    expect(sweptOnClose({ used: false, usedAmountCents: 500, useBy: '2026-12-31' }, TODAY)).toBe(false)
    expect(sweptOnClose({ used: false, usedAmountCents: null, useBy: '2026-06-30' }, TODAY)).toBe(false)
  })
})
