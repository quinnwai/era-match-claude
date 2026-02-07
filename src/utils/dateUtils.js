/**
 * Calculate a 1-year date range centered on "yearsAgo" from today.
 * Returns Gmail-compatible date strings in YYYY/MM/DD format.
 */
export function calculateDateRange(yearsAgo, referenceDate = new Date()) {
  const center = new Date(referenceDate)
  center.setFullYear(center.getFullYear() - yearsAgo)

  const after = new Date(center)
  after.setMonth(after.getMonth() - 6)

  const before = new Date(center)
  before.setMonth(before.getMonth() + 6)

  return {
    after: formatGmailDate(after),
    before: formatGmailDate(before),
  }
}

function formatGmailDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}
