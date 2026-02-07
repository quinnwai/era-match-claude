/**
 * Message Parser — decodes and sanitizes email content.
 */
import DOMPurify from 'dompurify'

/** Sanitize HTML email content to prevent XSS */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'div', 'span', 'a', 'b', 'i', 'em', 'strong',
      'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'img', 'hr', 'font', 'center', 'small', 'big', 'sub', 'sup',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'style', 'class', 'color', 'size', 'face',
      'width', 'height', 'align', 'valign', 'bgcolor', 'border',
      'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'target',
    ],
    ALLOW_DATA_ATTR: false,
  })
}

/** Convert plain text email to simple HTML for display */
export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Convert URLs to links
  const withLinks = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  )
  // Convert newlines to <br>
  return withLinks.replace(/\n/g, '<br>')
}

/** Strip common email signatures and quoted text */
export function stripSignature(text: string): string {
  // Common signature delimiters
  const sigPatterns = [
    /^--\s*$/m,           // Standard sig delimiter: "-- "
    /^_{3,}$/m,           // Underscores
    /^-{3,}$/m,           // Dashes
    /^Sent from my /m,    // Mobile signatures
    /^Get Outlook for /m,
  ]

  let result = text
  for (const pattern of sigPatterns) {
    const match = result.match(pattern)
    if (match?.index !== undefined) {
      // Only strip if the signature is in the last 30% of the message
      if (match.index > result.length * 0.7) {
        result = result.substring(0, match.index).trimEnd()
      }
    }
  }

  return result
}

/** Parse a "From" header into a display name */
export function parseFromHeader(from: string): { name: string; email: string } {
  // Format: "Display Name <email@example.com>" or just "email@example.com"
  const match = from.match(/^"?(.+?)"?\s*<(.+?)>$/)
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() }
  }
  return { name: from, email: from }
}

/** Format a date string for display */
export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/** Format a date string with time */
export function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}
