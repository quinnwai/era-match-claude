/**
 * Build a Gmail search query string with date range and exclusion filters.
 */
export function buildSearchQuery(dateRange) {
  const parts = [
    `after:${dateRange.after}`,
    `before:${dateRange.before}`,
    '-in:spam',
    '-in:trash',
    '-category:promotions',
    '-category:updates',
    '-category:social',
    '-from:noreply',
    '-from:no-reply',
    '-from:notifications',
    '-from:mailer-daemon',
    '-from:postmaster',
    '-subject:unsubscribe',
  ]

  return parts.join(' ')
}
