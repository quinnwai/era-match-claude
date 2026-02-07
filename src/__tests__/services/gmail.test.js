import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchMessages, getFullMessage, handleApiError } from '../../services/gmail'

describe('gmail service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('searchMessages', () => {
    it('makes a GET request to the correct URL with query params', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: '1', threadId: 't1' }], nextPageToken: null }),
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

      await searchMessages('test-token', 'test query', 50)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('gmail.googleapis.com/gmail/v1/users/me/messages?'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      )
      const calledUrl = fetch.mock.calls[0][0]
      expect(calledUrl).toContain('q=test+query')
      expect(calledUrl).toContain('maxResults=50')
    })

    it('returns empty array when API returns no messages field', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ resultSizeEstimate: 0 }),
      })

      const result = await searchMessages('token', 'query')
      expect(result.messages).toEqual([])
    })

    it('returns the array of IDs on success', async () => {
      const messages = [
        { id: '1', threadId: 't1' },
        { id: '2', threadId: 't2' },
      ]
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages }),
      })

      const result = await searchMessages('token', 'query')
      expect(result.messages).toEqual(messages)
    })

    it('returns error for 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      })

      const result = await searchMessages('token', 'query')
      expect(result.error.type).toBe('auth_expired')
    })
  })

  describe('getFullMessage', () => {
    it('makes a GET request with the message ID', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'msg1', payload: {} }),
      })

      await getFullMessage('token', 'msg1')
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages/msg1?format=full'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer token' },
        })
      )
    })

    it('returns the full message payload', async () => {
      const message = { id: 'msg1', payload: { mimeType: 'text/plain' } }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(message),
      })

      const result = await getFullMessage('token', 'msg1')
      expect(result).toEqual(message)
    })
  })

  describe('handleApiError', () => {
    it('returns auth_expired for 401', () => {
      const result = handleApiError({ status: 401 })
      expect(result.error.type).toBe('auth_expired')
      expect(result.error.status).toBe(401)
    })

    it('returns rate_limit for 429', () => {
      const result = handleApiError({ status: 429 })
      expect(result.error.type).toBe('rate_limit')
      expect(result.error.status).toBe(429)
    })

    it('returns unknown for other errors', () => {
      const result = handleApiError({ status: 500 })
      expect(result.error.type).toBe('unknown')
      expect(result.error.status).toBe(500)
    })
  })
})
