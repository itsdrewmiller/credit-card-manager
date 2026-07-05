import { describe, it, expect } from 'vitest'
import { cardSpendStatus } from '../../src/main/domain/recurring'

describe('cardSpendStatus', () => {
  it('flags cards with no signup bonus at all', () => {
    expect(cardSpendStatus([])).toBe('no_bonus')
  })

  it('reports working while a bonus still needs spend', () => {
    expect(
      cardSpendStatus([{ received: false, targetSpendCents: 400000, spendSoFarCents: 100000 }])
    ).toBe('working')
  })

  it('flags cards whose bonuses are all met or received', () => {
    expect(
      cardSpendStatus([
        { received: false, targetSpendCents: 400000, spendSoFarCents: 400000 }, // spend met
        { received: true, targetSpendCents: 100000, spendSoFarCents: 0 } // received
      ])
    ).toBe('bonus_done')
  })

  it('treats an unmet bonus without a spend target as still working', () => {
    expect(
      cardSpendStatus([{ received: false, targetSpendCents: null, spendSoFarCents: 0 }])
    ).toBe('working')
  })

  it('one live bonus among finished ones keeps the card working', () => {
    expect(
      cardSpendStatus([
        { received: true, targetSpendCents: 100000, spendSoFarCents: 100000 },
        { received: false, targetSpendCents: 300000, spendSoFarCents: 50000 }
      ])
    ).toBe('working')
  })
})
