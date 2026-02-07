import { describe, it, expect } from 'vitest'
import { formatEmailDate, formatSenderName, parseSender } from '../../utils/formatUtils'

describe('formatEmailDate', () => {
  it('formats an RFC 2822 date string to a friendly format', () => {
    const result = formatEmailDate('Tue, 14 Mar 2011 15:42:00 -0400')
    expect(result).toContain('March')
    expect(result).toContain('14')
    expect(result).toContain('2011')
  })

  it('returns the original string for an invalid date', () => {
    expect(formatEmailDate('not-a-date')).toBe('not-a-date')
  })

  it('handles ISO date strings', () => {
    const result = formatEmailDate('2011-03-14T15:42:00Z')
    expect(result).toContain('March')
    expect(result).toContain('14')
    expect(result).toContain('2011')
  })
})

describe('formatSenderName', () => {
  it('extracts name from "Name <email>" format', () => {
    expect(formatSenderName('John Doe <john@example.com>')).toBe('John Doe')
  })

  it('returns bare email when no display name', () => {
    expect(formatSenderName('john@example.com')).toBe('john@example.com')
  })

  it('handles quoted names with commas', () => {
    expect(formatSenderName('"Doe, John" <john@example.com>')).toBe('Doe, John')
  })

  it('returns empty string for null input', () => {
    expect(formatSenderName(null)).toBe('')
  })
})

describe('parseSender', () => {
  it('parses name and email from From header', () => {
    const result = parseSender('John Doe <john@example.com>')
    expect(result.name).toBe('John Doe')
    expect(result.email).toBe('john@example.com')
  })

  it('handles bare email address', () => {
    const result = parseSender('john@example.com')
    expect(result.name).toBe('john@example.com')
    expect(result.email).toBe('john@example.com')
  })

  it('returns empty strings for null input', () => {
    const result = parseSender(null)
    expect(result.name).toBe('')
    expect(result.email).toBe('')
  })
})
