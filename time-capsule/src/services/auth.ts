/**
 * Google OAuth 2.0 authentication module.
 * Token is held in memory only — never persisted.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly'

let tokenClient: google.accounts.oauth2.TokenClient | null = null

interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
}

declare namespace google.accounts.oauth2 {
  interface TokenClient {
    requestAccessToken: (overrides?: { prompt?: string }) => void
  }
  function initTokenClient(config: {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
  }): TokenClient
}

function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById('gsi-script')) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = 'gsi-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
}

export async function initAuth(): Promise<void> {
  await loadGsiScript()
}

export function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID not configured'))
      return
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response: TokenResponse) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve(response.access_token)
        }
      },
    })

    tokenClient.requestAccessToken({ prompt: 'consent' })
  })
}

export function getClientId(): string {
  return GOOGLE_CLIENT_ID
}
