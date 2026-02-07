/**
 * Session Manager — handles cleanup on sign-out and tab close.
 * Ensures no email data persists after the session ends.
 */
import { revokeToken } from './gmail'

type CleanupCallback = () => void

let cleanupFn: CleanupCallback | null = null
let beforeUnloadHandler: (() => void) | null = null

export function registerSessionCleanup(token: string, onCleanup: CleanupCallback): void {
  cleanupFn = onCleanup

  beforeUnloadHandler = () => {
    // Best-effort token revocation on tab close
    // navigator.sendBeacon doesn't support custom headers, so we use the revoke endpoint
    const url = `https://oauth2.googleapis.com/revoke?token=${token}`
    navigator.sendBeacon(url)
    onCleanup()
  }

  window.addEventListener('beforeunload', beforeUnloadHandler)
}

export async function endSession(token: string): Promise<void> {
  // Revoke the OAuth token
  await revokeToken(token)

  // Run cleanup callback (clears React state)
  if (cleanupFn) {
    cleanupFn()
    cleanupFn = null
  }

  // Remove beforeunload listener
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler)
    beforeUnloadHandler = null
  }
}

export function removeBeforeUnloadListener(): void {
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler)
    beforeUnloadHandler = null
  }
}
