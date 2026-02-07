import { useState, useCallback, useRef } from 'react'
import { calculateDateRange } from '../utils/dateUtils'
import { buildSearchQuery } from '../services/filterUtils'
import { searchMessages, getFullMessage } from '../services/gmail'
import { pickRandomExcluding } from '../services/randomPicker'
import { parseMessage } from '../services/emailParser'

export function useEmails(token) {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  // Persist across renders without triggering re-renders
  const seenIdsRef = useRef(new Set())
  const messagePoolRef = useRef([])
  const nextPageTokenRef = useRef(null)
  const currentQueryRef = useRef('')

  const fetchEmailBatch = useCallback(
    async (messageIds) => {
      const parsed = []
      for (const msg of messageIds) {
        const full = await getFullMessage(token, msg.id)
        if (full.error) {
          setError(full.error)
          return []
        }
        parsed.push(parseMessage(full))
        seenIdsRef.current.add(msg.id)
      }
      return parsed
    },
    [token]
  )

  const fetchEmails = useCallback(
    async (yearsAgo) => {
      setLoading(true)
      setError(null)
      setEmails([])
      seenIdsRef.current = new Set()
      messagePoolRef.current = []
      nextPageTokenRef.current = null

      try {
        const dateRange = calculateDateRange(yearsAgo)
        const query = buildSearchQuery(dateRange)
        currentQueryRef.current = query

        const result = await searchMessages(token, query)
        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }

        messagePoolRef.current = result.messages
        nextPageTokenRef.current = result.nextPageToken
        setHasMore(result.messages.length > 3 || !!result.nextPageToken)

        const picks = pickRandomExcluding(result.messages, 3, seenIdsRef.current)
        const parsed = await fetchEmailBatch(picks)
        setEmails(parsed)
      } catch (err) {
        setError({ type: 'unknown', message: err.message })
      } finally {
        setLoading(false)
      }
    },
    [token, fetchEmailBatch]
  )

  const fetchMore = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let picks = pickRandomExcluding(messagePoolRef.current, 3, seenIdsRef.current)

      // If pool exhausted, try to get more from Gmail
      if (picks.length === 0 && nextPageTokenRef.current) {
        const result = await searchMessages(
          token,
          currentQueryRef.current,
          50,
          nextPageTokenRef.current
        )
        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }
        messagePoolRef.current = [...messagePoolRef.current, ...result.messages]
        nextPageTokenRef.current = result.nextPageToken
        picks = pickRandomExcluding(result.messages, 3, seenIdsRef.current)
      }

      if (picks.length === 0) {
        setHasMore(false)
        setLoading(false)
        return
      }

      const parsed = await fetchEmailBatch(picks)
      setEmails((prev) => [...prev, ...parsed])
    } catch (err) {
      setError({ type: 'unknown', message: err.message })
    } finally {
      setLoading(false)
    }
  }, [token, fetchEmailBatch])

  const shuffle = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const picks = pickRandomExcluding(messagePoolRef.current, 3, seenIdsRef.current)

      if (picks.length === 0 && nextPageTokenRef.current) {
        const result = await searchMessages(
          token,
          currentQueryRef.current,
          50,
          nextPageTokenRef.current
        )
        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }
        messagePoolRef.current = [...messagePoolRef.current, ...result.messages]
        nextPageTokenRef.current = result.nextPageToken
        const newPicks = pickRandomExcluding(result.messages, 3, seenIdsRef.current)
        const parsed = await fetchEmailBatch(newPicks)
        setEmails(parsed)
      } else {
        const parsed = await fetchEmailBatch(picks)
        setEmails(parsed)
      }
    } catch (err) {
      setError({ type: 'unknown', message: err.message })
    } finally {
      setLoading(false)
    }
  }, [token, fetchEmailBatch])

  return { emails, loading, error, hasMore, fetchEmails, fetchMore, shuffle }
}
