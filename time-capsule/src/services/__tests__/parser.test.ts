import { describe, it, expect } from 'vitest'
import {
  sanitizeHtml,
  plainTextToHtml,
  stripSignature,
  parseFromHeader,
  formatDate,
  formatDateTime,
} from '../parser'

describe('Message Parser', () => {
  describe('sanitizeHtml', () => {
    it('allows safe HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>'
      expect(sanitizeHtml(input)).toBe('<p>Hello <strong>world</strong></p>')
    })

    it('strips script tags (XSS prevention)', () => {
      const input = '<p>Hello</p><script>alert("xss")</script>'
      expect(sanitizeHtml(input)).not.toContain('<script>')
      expect(sanitizeHtml(input)).not.toContain('alert')
    })

    it('strips onclick handlers (XSS prevention)', () => {
      const input = '<div onclick="alert(1)">Click me</div>'
      const result = sanitizeHtml(input)
      expect(result).not.toContain('onclick')
    })

    it('allows href attributes on links', () => {
      const input = '<a href="https://example.com">Link</a>'
      expect(sanitizeHtml(input)).toContain('href="https://example.com"')
    })

    it('strips iframe tags', () => {
      const input = '<iframe src="https://evil.com"></iframe>'
      expect(sanitizeHtml(input)).not.toContain('<iframe')
    })

    it('preserves table structure', () => {
      const input = '<table><tr><td>Cell</td></tr></table>'
      expect(sanitizeHtml(input)).toContain('<table>')
      expect(sanitizeHtml(input)).toContain('<td>')
    })
  })

  describe('plainTextToHtml', () => {
    it('converts newlines to <br> tags', () => {
      expect(plainTextToHtml('line1\nline2')).toContain('<br>')
    })

    it('escapes HTML special characters', () => {
      expect(plainTextToHtml('<script>')).toContain('&lt;script&gt;')
    })

    it('converts URLs to clickable links', () => {
      const result = plainTextToHtml('Visit https://example.com today')
      expect(result).toContain('<a href="https://example.com"')
      expect(result).toContain('target="_blank"')
    })

    it('sets noopener noreferrer on links', () => {
      const result = plainTextToHtml('https://example.com')
      expect(result).toContain('rel="noopener noreferrer"')
    })
  })

  describe('stripSignature', () => {
    it('strips standard "-- " signature delimiter at end', () => {
      const text = 'Hello there!\n\nThis is my message.\n\n' +
        'Some more text here to make this long enough.\n' +
        'And even more text to fill it up.\n' +
        'Continuing with more content.\n' +
        'Almost at the end now.\n' +
        '-- \nJohn Doe\nSent from something'
      expect(stripSignature(text)).not.toContain('John Doe')
    })

    it('strips "Sent from my" mobile signatures at end', () => {
      const text = 'Hello there!\n\nThis is my message.' +
        '\nMore content here to pad this out.' +
        '\nEven more text filling space.' +
        '\nAdding more lines.' +
        '\nSent from my iPhone'
      expect(stripSignature(text)).not.toContain('Sent from my iPhone')
    })

    it('preserves content when signature marker is early in message', () => {
      const text = '-- \nThis is actually part of my message and there is a lot more to come after this point so it should not be stripped.'
      expect(stripSignature(text)).toContain('This is actually part')
    })
  })

  describe('parseFromHeader', () => {
    it('parses "Name <email>" format', () => {
      const result = parseFromHeader('John Doe <john@example.com>')
      expect(result.name).toBe('John Doe')
      expect(result.email).toBe('john@example.com')
    })

    it('parses quoted name format', () => {
      const result = parseFromHeader('"Jane Smith" <jane@example.com>')
      expect(result.name).toBe('Jane Smith')
      expect(result.email).toBe('jane@example.com')
    })

    it('handles plain email address', () => {
      const result = parseFromHeader('user@example.com')
      expect(result.name).toBe('user@example.com')
      expect(result.email).toBe('user@example.com')
    })
  })

  describe('formatDate', () => {
    it('formats a valid date string', () => {
      const result = formatDate('2012-06-15T10:30:00Z')
      expect(result).toContain('Jun')
      expect(result).toContain('15')
      expect(result).toContain('2012')
    })

    it('returns original string for invalid date', () => {
      expect(formatDate('not a date')).toBe('not a date')
    })
  })

  describe('formatDateTime', () => {
    it('includes time in output', () => {
      const result = formatDateTime('2012-06-15T10:30:00Z')
      expect(result).toContain('Jun')
      expect(result).toContain('15')
      expect(result).toContain('2012')
    })

    it('returns original string for invalid date', () => {
      expect(formatDateTime('not a date')).toBe('not a date')
    })
  })
})
