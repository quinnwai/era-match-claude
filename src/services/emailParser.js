import { formatEmailDate, parseSender } from '../utils/formatUtils'

/**
 * Parse a Gmail API message object into a clean renderable format.
 */
export function parseMessage(apiMessage) {
  const headers = apiMessage.payload?.headers || []

  const getHeader = (name) => {
    const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    return h ? h.value : ''
  }

  const from = parseSender(getHeader('From'))
  const to = getHeader('To')
  const rawDate = getHeader('Date')
  const subject = getHeader('Subject')

  const { html, text } = extractBodies(apiMessage.payload)

  return {
    id: apiMessage.id,
    from,
    to,
    date: formatEmailDate(rawDate),
    rawDate,
    subject,
    bodyHtml: html,
    bodyText: text,
    snippet: apiMessage.snippet || '',
  }
}

/**
 * Walk the MIME parts tree to find text/html and text/plain bodies.
 */
function extractBodies(payload) {
  let html = null
  let text = null

  if (!payload) return { html, text }

  function walk(part) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      html = decodeBase64Url(part.body.data)
    } else if (part.mimeType === 'text/plain' && part.body?.data) {
      text = decodeBase64Url(part.body.data)
    }

    if (part.parts) {
      for (const child of part.parts) {
        walk(child)
      }
    }
  }

  walk(payload)
  return { html, text }
}

/**
 * Decode base64url-encoded string (Gmail API format).
 */
function decodeBase64Url(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
  } catch {
    // fallback for non-UTF8 content
    return atob(base64)
  }
}
