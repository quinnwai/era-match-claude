import { useState, useCallback, useEffect } from 'react'
import type { AppView, EmailMessage, EmailThread } from './types'
import { LandingPage } from './components/LandingPage'
import { YearPicker } from './components/YearPicker'
import { MemoryInbox } from './components/MemoryInbox'
import { ThreadView } from './components/ThreadView'
import { initAuth, requestAccessToken } from './services/auth'
import { getProfile, getOldestMessageYear, fetchEmailBatch, fetchThread } from './services/gmail'
import { registerSessionCleanup, endSession } from './services/session'
import './App.css'

function App() {
  const [view, setView] = useState<AppView>('landing')
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initAuth().catch(() => {
      // GIS script may fail to load in dev without internet
    })
  }, [])

  const clearAllState = useCallback(() => {
    setView('landing')
    setAccessToken(null)
    setUserEmail(null)
    setSelectedYear(null)
    setAvailableYears([])
    setEmails([])
    setSelectedThread(null)
    setIsLoading(false)
    setError(null)
  }, [])

  const handleSignIn = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const token = await requestAccessToken()
      setAccessToken(token)

      // Register session cleanup for tab close
      registerSessionCleanup(token, clearAllState)

      // Get user profile
      const profile = await getProfile(token)
      setUserEmail(profile.emailAddress)

      // Detect available years
      setView('yearPicker')
      const oldestYear = await getOldestMessageYear(token)
      const currentYear = new Date().getFullYear()
      const years: number[] = []
      for (let y = currentYear; y >= oldestYear; y--) {
        years.push(y)
      }
      setAvailableYears(years)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in')
    } finally {
      setIsLoading(false)
    }
  }, [clearAllState])

  const handleSelectYear = useCallback(async (year: number) => {
    if (!accessToken) return
    setSelectedYear(year)
    setView('inbox')
    setIsLoading(true)
    setError(null)
    try {
      const batch = await fetchEmailBatch(accessToken, year)
      setEmails(batch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails')
    } finally {
      setIsLoading(false)
    }
  }, [accessToken])

  const handleShuffle = useCallback(async () => {
    if (!accessToken || !selectedYear) return
    setIsLoading(true)
    try {
      const batch = await fetchEmailBatch(accessToken, selectedYear)
      setEmails(batch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to shuffle')
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, selectedYear])

  const handleSelectEmail = useCallback(async (threadId: string) => {
    if (!accessToken || !userEmail) return
    setIsLoading(true)
    setView('thread')
    try {
      const thread = await fetchThread(accessToken, threadId, userEmail)
      setSelectedThread(thread)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread')
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, userEmail])

  const handleBackToYears = useCallback(() => {
    setView('yearPicker')
    setSelectedYear(null)
    setEmails([])
    setError(null)
  }, [])

  const handleBackToInbox = useCallback(() => {
    setView('inbox')
    setSelectedThread(null)
    setError(null)
  }, [])

  const handleSignOut = useCallback(async () => {
    if (accessToken) {
      await endSession(accessToken)
    }
    clearAllState()
  }, [accessToken, clearAllState])

  return (
    <div className="app">
      {view === 'landing' && (
        <LandingPage
          onSignIn={handleSignIn}
          isLoading={isLoading}
          error={error}
        />
      )}

      {view === 'yearPicker' && (
        <YearPicker
          availableYears={availableYears}
          onSelectYear={handleSelectYear}
          onSignOut={handleSignOut}
          isLoading={availableYears.length === 0 && isLoading}
        />
      )}

      {view === 'inbox' && selectedYear && (
        <MemoryInbox
          emails={emails}
          year={selectedYear}
          onSelectEmail={handleSelectEmail}
          onShuffle={handleShuffle}
          onBack={handleBackToYears}
          isLoading={isLoading}
        />
      )}

      {view === 'thread' && (
        <ThreadView
          thread={selectedThread ?? { id: '', subject: '', messages: [] }}
          onBack={handleBackToInbox}
          isLoading={isLoading || !selectedThread}
        />
      )}

      {error && view !== 'landing' && (
        <div className="global-error" role="alert">
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  )
}

export default App
