import { describe, it, expect } from 'vitest'
import { parseMessage } from '../../services/emailParser'
import singlePartPlainText from '../fixtures/singlePartPlainText.json'
import multipartAlternative from '../fixtures/multipartAlternative.json'
import nestedMultipart from '../fixtures/nestedMultipart.json'
import missingHeaders from '../fixtures/missingHeaders.json'

describe('parseMessage', () => {
  it('parses a simple single-part plain text message', () => {
    const result = parseMessage(singlePartPlainText)
    expect(result.id).toBe('msg001')
    expect(result.from.name).toBe('John Doe')
    expect(result.from.email).toBe('john@example.com')
    expect(result.to).toBe('jane@example.com')
    expect(result.subject).toBe('Hey there!')
    expect(result.bodyText).toContain('Hey, how are you doing?')
    expect(result.bodyHtml).toBeNull()
  })

  it('parses a multipart/alternative message with both HTML and plain text', () => {
    const result = parseMessage(multipartAlternative)
    expect(result.id).toBe('msg002')
    expect(result.from.name).toBe('Smith, Alice')
    expect(result.bodyText).toContain('Check out this cool thing!')
    expect(result.bodyHtml).toContain('<h1>')
    expect(result.subject).toBe('Check this out!')
  })

  it('parses a deeply nested multipart message', () => {
    const result = parseMessage(nestedMultipart)
    expect(result.id).toBe('msg003')
    expect(result.bodyText).toContain('Plain text inside nested multipart')
    expect(result.bodyHtml).not.toBeNull()
  })

  it('extracts From, To, Date, Subject from headers', () => {
    const result = parseMessage(singlePartPlainText)
    expect(result.from.name).toBe('John Doe')
    expect(result.to).toBe('jane@example.com')
    expect(result.date).toContain('March')
    expect(result.date).toContain('14')
    expect(result.date).toContain('2011')
    expect(result.subject).toBe('Hey there!')
  })

  it('returns bodyHtml as null when no HTML part exists', () => {
    const result = parseMessage(singlePartPlainText)
    expect(result.bodyHtml).toBeNull()
  })

  it('handles missing headers gracefully', () => {
    const result = parseMessage(missingHeaders)
    expect(result.from.name).toBe('')
    expect(result.from.email).toBe('')
    expect(result.to).toBe('')
    expect(result.subject).toBe('')
    expect(result.bodyText).toContain('No headers here')
  })

  it('preserves the snippet from the API response', () => {
    const result = parseMessage(singlePartPlainText)
    expect(result.snippet).toBe('Hey, how are you doing?')
  })
})
