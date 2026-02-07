/**
 * Format an RFC 2822 or ISO date string to a friendly display format.
 * e.g. "March 14, 2011 at 3:42 PM"
 */
export function formatEmailDate(dateString) {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return dateString

  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }

  const formatted = date.toLocaleString('en-US', options)
  // toLocaleString produces "March 14, 2011 at 3:42 PM" in most environments
  return formatted
}

/**
 * Extract display name from a "Name <email>" From header string.
 */
export function formatSenderName(fromHeader) {
  if (!fromHeader) return ''

  // Handle quoted names: "Doe, John" <email>
  const quotedMatch = fromHeader.match(/^"([^"]+)"\s*</)
  if (quotedMatch) return quotedMatch[1]

  // Handle unquoted names: John Doe <email>
  const nameMatch = fromHeader.match(/^([^<]+)\s*</)
  if (nameMatch) return nameMatch[1].trim()

  // No angle brackets — just return as-is (bare email)
  return fromHeader.trim()
}

/**
 * Parse a From header into { name, email } parts.
 */
export function parseSender(fromHeader) {
  if (!fromHeader) return { name: '', email: '' }

  const emailMatch = fromHeader.match(/<([^>]+)>/)
  const email = emailMatch ? emailMatch[1] : fromHeader.trim()
  const name = formatSenderName(fromHeader)

  return { name, email }
}
