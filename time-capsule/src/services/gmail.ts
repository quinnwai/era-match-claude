/**
 * Gmail API service — all Gmail interactions happen here.
 * No data is stored outside of React state.
 */
import type { EmailMessage, EmailThread, ThreadMessage, GmailProfile } from '../types'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

const AUTOMATED_SENDERS = [
  'noreply@', 'no-reply@', 'notifications@', 'mailer-daemon@',
  'postmaster@', 'do-not-reply@', 'donotreply@', 'auto-confirm@',
  'support@', 'news@', 'updates@', 'info@', 'newsletter@',
]

async function gmailFetch<T>(endpoint: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${GMAIL_API}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gmail API error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export async function getProfile(token: string): Promise<GmailProfile> {
  return gmailFetch<GmailProfile>('/profile', token)
}

export async function getOldestMessageYear(token: string): Promise<number> {
  interface ListResponse { messages?: { id: string }[] }
  // Search for the oldest message by sorting implicitly (Gmail returns oldest with this trick)
  const data = await gmailFetch<ListResponse>('/messages', token, {
    q: 'category:primary',
    maxResults: '1',
    // Gmail doesn't support sort, but we query all time and take the first result
    // which is actually the most recent. We need a different approach.
  })

  if (!data.messages?.length) {
    return new Date().getFullYear()
  }

  // Binary search for the oldest year with messages
  const currentYear = new Date().getFullYear()
  let low = 2004 // Gmail launched in 2004
  let high = currentYear
  let oldestFound = currentYear

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const check = await gmailFetch<ListResponse>('/messages', token, {
      q: `after:${mid}/1/1 before:${mid + 1}/1/1`,
      maxResults: '1',
    })
    if (check.messages?.length) {
      oldestFound = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return oldestFound
}

function buildSearchQuery(year: number): string {
  const exclusions = AUTOMATED_SENDERS.map(s => `-from:${s}`).join(' ')
  return `after:${year}/1/1 before:${year + 1}/1/1 category:primary ${exclusions} -category:promotions -category:social -category:updates`
}

export async function fetchMessagePool(token: string, year: number): Promise<string[]> {
  interface ListResponse { messages?: { id: string }[]; nextPageToken?: string }
  const allIds: string[] = []
  let pageToken: string | undefined

  // Fetch up to 500 message IDs (max 2 pages)
  for (let page = 0; page < 2; page++) {
    const params: Record<string, string> = {
      q: buildSearchQuery(year),
      maxResults: '250',
    }
    if (pageToken) params.pageToken = pageToken

    const data = await gmailFetch<ListResponse>('/messages', token, params)
    if (data.messages) {
      allIds.push(...data.messages.map(m => m.id))
    }
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }

  return allIds
}

export function sampleIds(ids: string[], count: number = 10): string[] {
  if (ids.length <= count) return [...ids]
  const shuffled = [...ids]
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}

export async function fetchMessageMetadata(token: string, messageId: string): Promise<EmailMessage> {
  interface GmailMessage {
    id: string
    threadId: string
    labelIds?: string[]
    snippet: string
    payload: {
      headers: { name: string; value: string }[]
    }
  }

  const msg = await gmailFetch<GmailMessage>(`/messages/${messageId}`, token, {
    format: 'metadata',
    metadataHeaders: 'From,To,Subject,Date',
  })

  const getHeader = (name: string) =>
    msg.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: getHeader('Subject') || '(no subject)',
    from: getHeader('From'),
    to: getHeader('To'),
    date: getHeader('Date'),
    snippet: msg.snippet,
    labelIds: msg.labelIds,
  }
}

export async function fetchEmailBatch(token: string, year: number): Promise<EmailMessage[]> {
  const pool = await fetchMessagePool(token, year)
  if (pool.length === 0) return []
  const sampled = sampleIds(pool, 10)
  const messages = await Promise.all(sampled.map(id => fetchMessageMetadata(token, id)))
  return messages
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  return decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  )
}

function extractBody(payload: GmailPayload): { body: string; isHtml: boolean } {
  // Check for direct body
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data)
    return { body: decoded, isHtml: payload.mimeType === 'text/html' }
  }

  // Check parts (multipart messages)
  if (payload.parts) {
    // Prefer HTML for richer display
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html')
    if (htmlPart?.body?.data) {
      return { body: decodeBase64Url(htmlPart.body.data), isHtml: true }
    }
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain')
    if (textPart?.body?.data) {
      return { body: decodeBase64Url(textPart.body.data), isHtml: false }
    }
    // Recurse into nested parts (multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      if (part.parts) {
        const result = extractBody(part)
        if (result.body) return result
      }
    }
  }

  return { body: '', isHtml: false }
}

interface GmailPayload {
  mimeType: string
  body?: { data?: string }
  headers?: { name: string; value: string }[]
  parts?: GmailPayload[]
}

interface GmailThreadMessage {
  id: string
  labelIds?: string[]
  payload: GmailPayload
  snippet: string
}

export async function fetchThread(token: string, threadId: string, userEmail: string): Promise<EmailThread> {
  interface ThreadResponse {
    id: string
    messages: GmailThreadMessage[]
  }

  const data = await gmailFetch<ThreadResponse>(`/threads/${threadId}`, token, {
    format: 'full',
  })

  const getHeader = (headers: { name: string; value: string }[] | undefined, name: string) =>
    headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

  const subject = getHeader(data.messages[0]?.payload.headers, 'Subject') || '(no subject)'

  const messages: ThreadMessage[] = data.messages.map(msg => {
    const from = getHeader(msg.payload.headers, 'From')
    const to = getHeader(msg.payload.headers, 'To')
    const date = getHeader(msg.payload.headers, 'Date')
    const { body, isHtml } = extractBody(msg.payload)

    const isSent = from.toLowerCase().includes(userEmail.toLowerCase()) ||
      (msg.labelIds?.includes('SENT') ?? false)

    return { id: msg.id, from, to, date, body, isHtml, isSent }
  })

  return { id: data.id, subject, messages }
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  } catch {
    // Best effort — token may already be invalid
  }
}

// Exported for testing
export { buildSearchQuery, AUTOMATED_SENDERS }
