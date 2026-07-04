import { describe, it, expect } from 'vitest'
import { cardMissingFields } from '../../src/main/domain/needsInfo'
import { CARD_REQUIRED_FIELDS } from '../../src/shared/constants'

describe('cardMissingFields', () => {
  it('returns nothing for a fully-filled card', () => {
    const full = {
      cardProductId: 1,
      ownerPersonId: 2,
      annualFeeCents: 55000,
      openedDate: '2026-01-15',
      status: 'open'
    }
    expect(cardMissingFields(full)).toEqual([])
  })

  it('flags every required field on a bare imported stub', () => {
    expect(cardMissingFields({ status: 'open' })).toEqual([...CARD_REQUIRED_FIELDS])
  })

  it('treats zero annual fee as present', () => {
    const noFee = {
      cardProductId: 1,
      ownerPersonId: 2,
      annualFeeCents: 0,
      openedDate: '2026-01-15',
      status: 'open'
    }
    expect(cardMissingFields(noFee)).toEqual([])
  })

  it('never nags closed or historical cards', () => {
    expect(cardMissingFields({ status: 'closed' })).toEqual([])
    expect(cardMissingFields({ status: 'rejected' })).toEqual([])
    expect(cardMissingFields({ status: 'product_changed' })).toEqual([])
  })

  it('still evaluates applied cards', () => {
    expect(cardMissingFields({ status: 'applied' }).length).toBe(CARD_REQUIRED_FIELDS.length)
  })
})
