import { describe, it, expect } from 'vitest'
import { buildSearchQuery } from '../../services/filterUtils'

describe('buildSearchQuery', () => {
  const dateRange = { after: '2010/08/07', before: '2011/08/07' }

  it('includes correct after and before dates', () => {
    const query = buildSearchQuery(dateRange)
    expect(query).toContain('after:2010/08/07')
    expect(query).toContain('before:2011/08/07')
  })

  it('excludes spam and trash', () => {
    const query = buildSearchQuery(dateRange)
    expect(query).toContain('-in:spam')
    expect(query).toContain('-in:trash')
  })

  it('excludes category:promotions, updates, and social', () => {
    const query = buildSearchQuery(dateRange)
    expect(query).toContain('-category:promotions')
    expect(query).toContain('-category:updates')
    expect(query).toContain('-category:social')
  })

  it('excludes automated senders', () => {
    const query = buildSearchQuery(dateRange)
    expect(query).toContain('-from:noreply')
    expect(query).toContain('-from:no-reply')
    expect(query).toContain('-from:notifications')
    expect(query).toContain('-from:mailer-daemon')
    expect(query).toContain('-from:postmaster')
  })

  it('excludes unsubscribe subject', () => {
    const query = buildSearchQuery(dateRange)
    expect(query).toContain('-subject:unsubscribe')
  })

  it('is a single properly-formatted string with spaces', () => {
    const query = buildSearchQuery(dateRange)
    // No double spaces
    expect(query).not.toMatch(/  /)
    // All parts separated by single spaces
    const parts = query.split(' ')
    expect(parts.length).toBeGreaterThan(5)
    parts.forEach((p) => expect(p.length).toBeGreaterThan(0))
  })
})
