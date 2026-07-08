import { describe, it, expect } from 'vitest'
import { parseAvgMonthlySpendCents } from '../../src/main/import/equifax'

describe('parseAvgMonthlySpendCents', () => {
  it('averages 12 months of actual payments across accounts', () => {
    const items = [
      'Date Reported:', '06/01/2026',
      'Account History',
      'Actual Payment', '$1,200', '$800', '--', '$1,000',
      'Balance', '$5,000', '$4,000',
      'Actual Payment Amount:', '$500', '$500', '$500',
      'Scheduled Payment', '$100'
    ]
    // (1200+800+1000)/12 + (500*3)/12 = 250 + 125 = $375
    expect(parseAvgMonthlySpendCents(items)).toBe(37500)
  })

  it('reads at most 12 monthly values per account', () => {
    const items = ['Actual Payment', ...Array.from({ length: 20 }, () => '$120')]
    expect(parseAvgMonthlySpendCents(items)).toBe(12000) // 12 × $120 / 12
  })

  it('returns null when the report has no payment-history dollars', () => {
    expect(parseAvgMonthlySpendCents(['Date Reported:', '06/01/2026', 'Balance:', '$100'])).toBeNull()
  })
})
