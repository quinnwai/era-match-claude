import { describe, it, expect, vi } from 'vitest'
import { calculateDateRange } from '../../utils/dateUtils'

describe('calculateDateRange', () => {
  it('returns correct range for 15 years ago from 2026-02-07', () => {
    const ref = new Date(2026, 1, 7) // Feb 7, 2026
    const range = calculateDateRange(15, ref)
    expect(range.after).toBe('2010/08/07')
    expect(range.before).toBe('2011/08/07')
  })

  it('returns a range centered on today for 0 years ago', () => {
    const ref = new Date(2026, 1, 7)
    const range = calculateDateRange(0, ref)
    expect(range.after).toBe('2025/08/07')
    expect(range.before).toBe('2026/08/07')
  })

  it('returns a range centered on 30 years ago', () => {
    const ref = new Date(2026, 1, 7)
    const range = calculateDateRange(30, ref)
    expect(range.after).toBe('1995/08/07')
    expect(range.before).toBe('1996/08/07')
  })

  it('handles leap year edge case (Feb 29 -> Feb 28 adjustment)', () => {
    // Mar 1, 2025, 4 years ago = Mar 1, 2021
    // 6 months before Mar 1, 2021 = Sep 1, 2020
    // 6 months after Mar 1, 2021 = Sep 1, 2021
    const ref = new Date(2025, 2, 1) // Mar 1, 2025
    const range = calculateDateRange(4, ref)
    expect(range.after).toBe('2020/09/01')
    expect(range.before).toBe('2021/09/01')
  })

  it('produces a 1-year window (before - after ≈ 365 days)', () => {
    const ref = new Date(2026, 1, 7)
    const range = calculateDateRange(10, ref)
    const after = new Date(range.after.replace(/\//g, '-'))
    const before = new Date(range.before.replace(/\//g, '-'))
    const diffDays = (before - after) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(360)
    expect(diffDays).toBeLessThanOrEqual(370)
  })
})
