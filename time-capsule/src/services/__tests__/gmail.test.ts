import { describe, it, expect } from 'vitest'
import { sampleIds, buildSearchQuery, AUTOMATED_SENDERS } from '../gmail'

describe('Gmail Service', () => {
  describe('sampleIds', () => {
    it('returns all IDs when pool is smaller than count', () => {
      const ids = ['a', 'b', 'c']
      const result = sampleIds(ids, 10)
      expect(result).toHaveLength(3)
      expect(result).toEqual(expect.arrayContaining(['a', 'b', 'c']))
    })

    it('returns exactly count IDs when pool is larger', () => {
      const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`)
      const result = sampleIds(ids, 10)
      expect(result).toHaveLength(10)
    })

    it('returns unique IDs (no duplicates)', () => {
      const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`)
      const result = sampleIds(ids, 10)
      const unique = new Set(result)
      expect(unique.size).toBe(10)
    })

    it('does not mutate the original array', () => {
      const ids = ['a', 'b', 'c', 'd', 'e']
      const copy = [...ids]
      sampleIds(ids, 3)
      expect(ids).toEqual(copy)
    })

    it('defaults to 10 samples', () => {
      const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`)
      const result = sampleIds(ids)
      expect(result).toHaveLength(10)
    })
  })

  describe('buildSearchQuery', () => {
    it('includes correct date range for given year', () => {
      const query = buildSearchQuery(2012)
      expect(query).toContain('after:2012/1/1')
      expect(query).toContain('before:2013/1/1')
    })

    it('includes category:primary', () => {
      const query = buildSearchQuery(2015)
      expect(query).toContain('category:primary')
    })

    it('excludes promotions, social, and updates categories', () => {
      const query = buildSearchQuery(2015)
      expect(query).toContain('-category:promotions')
      expect(query).toContain('-category:social')
      expect(query).toContain('-category:updates')
    })

    it('excludes all automated senders', () => {
      const query = buildSearchQuery(2015)
      for (const sender of AUTOMATED_SENDERS) {
        expect(query).toContain(`-from:${sender}`)
      }
    })
  })
})
