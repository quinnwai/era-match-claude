const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

/**
 * Search for message IDs matching a Gmail query.
 * Returns an array of { id, threadId } objects.
 */
export async function searchMessages(token, query, maxResults = 50, pageToken = null) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  })
  if (pageToken) {
    params.set('pageToken', pageToken)
  }

  const response = await fetch(`${GMAIL_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    return handleApiError(response)
  }

  const data = await response.json()
  return {
    messages: data.messages || [],
    nextPageToken: data.nextPageToken || null,
  }
}

/**
 * Fetch the full message by ID.
 */
export async function getFullMessage(token, messageId) {
  const response = await fetch(`${GMAIL_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    return handleApiError(response)
  }

  return response.json()
}

/**
 * Handle API errors and return structured error objects.
 */
export function handleApiError(response) {
  if (response.status === 401) {
    return { error: { type: 'auth_expired', status: 401 } }
  }
  if (response.status === 429) {
    return { error: { type: 'rate_limit', status: 429 } }
  }
  return { error: { type: 'unknown', status: response.status } }
}
