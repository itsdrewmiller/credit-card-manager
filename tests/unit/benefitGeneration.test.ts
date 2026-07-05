import { describe, it, expect } from 'vitest'
import { addMonthsIso, planBenefitGeneration, type BenefitInstance } from '../../src/main/domain/benefitGeneration'

const today = new Date('2026-07-05T12:00:00')

function inst(over: Partial<BenefitInstance>): BenefitInstance {
  return {
    id: 1,
    cardId: 10,
    name: 'Lyft',
    category: 'Taxi',
    amountCents: 1000,
    valuePct: 100,
    period: 'monthly',
    useAfter: '2026-07-01',
    useBy: '2026-07-31',
    notes: null,
    ...over
  }
}

describe('addMonthsIso', () => {
  it('keeps month-end days at month-end', () => {
    expect(addMonthsIso('2026-04-30', 1)).toBe('2026-05-31')
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28')
  })
  it('preserves plain days and crosses years', () => {
    expect(addMonthsIso('2026-09-08', 12)).toBe('2027-09-08')
    expect(addMonthsIso('2026-11-15', 3)).toBe('2027-02-15')
  })
})

describe('planBenefitGeneration', () => {
  it('extends a monthly series until a year of coverage exists', () => {
    const plan = planBenefitGeneration([inst({})], today)
    expect(plan.date).toHaveLength(0)
    // Jul 2026 exists; first-eligible must reach 2027-07-05 -> Aug 2026..Aug 2027 = 13
    expect(plan.create).toHaveLength(13)
    expect(plan.create[0]).toMatchObject({ useAfter: '2026-08-01', useBy: '2026-08-31', year: 2026 })
    expect(plan.create.at(-1)).toMatchObject({ useAfter: '2027-08-01', useBy: '2027-08-31', year: 2027 })
  })

  it('preserves multiplicity of the latest window', () => {
    const plan = planBenefitGeneration([inst({ id: 1 }), inst({ id: 2 })], today)
    expect(plan.create).toHaveLength(26) // two per month
    expect(plan.create.filter((b) => b.useAfter === '2026-08-01')).toHaveLength(2)
  })

  it('extends anniversary-style annual windows by shape, not by calendar', () => {
    const plan = planBenefitGeneration(
      [inst({ period: 'annual', useAfter: '2026-09-08', useBy: '2026-09-23', name: 'Travel' })],
      today
    )
    expect(plan.create).toHaveLength(1)
    expect(plan.create[0]).toMatchObject({ useAfter: '2027-09-08', useBy: '2027-09-23' })
  })

  it('seeds undated template copies with the current calendar window, then extends', () => {
    const plan = planBenefitGeneration(
      [inst({ useAfter: null, useBy: null, period: 'quarterly' })],
      today
    )
    expect(plan.date).toEqual([{ id: 1, useAfter: '2026-07-01', useBy: '2026-09-30', year: 2026 }])
    // Q3-26 seeded; first-eligible must reach 2027-07-05 -> Q4-26..Q4-27 = 5 more
    expect(plan.create).toHaveLength(5)
    expect(plan.create.at(-1)).toMatchObject({ useAfter: '2027-10-01', useBy: '2027-12-31' })
  })

  it('ignores one-time and periodless benefits', () => {
    const plan = planBenefitGeneration(
      [inst({ period: 'one_time' }), inst({ id: 2, period: null })],
      today
    )
    expect(plan.create).toHaveLength(0)
    expect(plan.date).toHaveLength(0)
  })

  it('is idempotent once coverage reaches the horizon', () => {
    const first = planBenefitGeneration([inst({})], today)
    const after = [inst({}), ...first.create.map((b, i) => ({ ...inst({}), ...b, id: 100 + i }))]
    expect(planBenefitGeneration(after, today).create).toHaveLength(0)
  })
})
