import { describe, it, expect } from 'vitest'
import { benefitStatus, computeBenefit } from '../../src/main/domain/benefit'

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

describe('computeBenefit', () => {
  it('wraps benefitStatus', () => {
    expect(computeBenefit({ used: true }).status).toBe('used')
  })
})
