import { describe, it, expect } from 'vitest'
import { pickRandom, pickRandomExcluding } from '../../services/randomPicker'

describe('pickRandom', () => {
  it('returns exactly count unique items', () => {
    const result = pickRandom([1, 2, 3, 4, 5], 3)
    expect(result).toHaveLength(3)
    expect(new Set(result).size).toBe(3)
  })

  it('returns all items when count exceeds array length', () => {
    const result = pickRandom([1, 2], 5)
    expect(result).toHaveLength(2)
    expect(result.sort()).toEqual([1, 2])
  })

  it('returns empty array for empty input', () => {
    expect(pickRandom([], 3)).toEqual([])
  })

  it('returns empty array for null/undefined input', () => {
    expect(pickRandom(null, 3)).toEqual([])
    expect(pickRandom(undefined, 3)).toEqual([])
  })

  it('produces varying results over many runs (randomness check)', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const results = new Set()
    for (let i = 0; i < 100; i++) {
      const picked = pickRandom(items, 3)
      results.add(picked.sort().join(','))
    }
    // With 10 items choosing 3, over 100 runs we should see multiple unique combos
    expect(results.size).toBeGreaterThan(1)
  })
})

describe('pickRandomExcluding', () => {
  const items = [
    { id: 'a', val: 1 },
    { id: 'b', val: 2 },
    { id: 'c', val: 3 },
    { id: 'd', val: 4 },
    { id: 'e', val: 5 },
  ]

  it('never returns items in the exclude set', () => {
    const excludeIds = new Set(['a', 'b'])
    for (let i = 0; i < 50; i++) {
      const result = pickRandomExcluding(items, 2, excludeIds)
      result.forEach((item) => {
        expect(excludeIds.has(item.id)).toBe(false)
      })
    }
  })

  it('returns empty array when all items are excluded', () => {
    const excludeIds = new Set(['a', 'b', 'c', 'd', 'e'])
    const result = pickRandomExcluding(items, 3, excludeIds)
    expect(result).toEqual([])
  })

  it('returns available items when fewer than count remain', () => {
    const excludeIds = new Set(['a', 'b', 'c', 'd'])
    const result = pickRandomExcluding(items, 3, excludeIds)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e')
  })
})
