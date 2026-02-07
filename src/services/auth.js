const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

let tokenClient = null
let accessToken = null

/**
 * Load the Google Identity Services script and initialize the token client.
 */
export function initGoogleAuth() {
  return new Promise((resolve, reject) => {
    if (tokenClient) {
      resolve(tokenClient)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        callback: () => {}, // overridden per-call in signIn
      })
      resolve(tokenClient)
    }
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
}

/**
 * Trigger the OAuth popup and return the access token.
 */
export function signIn() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Google Auth not initialized. Call initGoogleAuth() first.'))
      return
    }

    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error))
        return
      }
      accessToken = response.access_token
      resolve(response.access_token)
    }

    tokenClient.requestAccessToken()
  })
}

/**
 * Clear the in-memory token.
 */
export function signOut() {
  if (accessToken && window.google) {
    window.google.accounts.oauth2.revoke(accessToken, () => {})
  }
  accessToken = null
}

/**
 * Return the current token or null.
 */
export function getToken() {
  return accessToken
}
