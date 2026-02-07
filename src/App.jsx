import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useEmails } from './hooks/useEmails'
import LoginScreen from './components/LoginScreen'
import TimePicker from './components/TimePicker'
import EmailList from './components/EmailList'
import EmailViewer from './components/EmailViewer'
import LoadingState from './components/LoadingState'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  const { isAuthenticated, token, loading: authLoading, error: authError, login, logout } = useAuth()
  const { emails, loading, error, hasMore, fetchEmails, fetchMore, shuffle } = useEmails(token)
  const [selectedEmailId, setSelectedEmailId] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100">
        <div className="text-amber-600 text-lg">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={login} error={authError} />
  }

  const selectedEmail = emails.find((e) => e.id === selectedEmailId)

  const handleSearch = (yearsAgo) => {
    setHasSearched(true)
    setSelectedEmailId(null)
    fetchEmails(yearsAgo)
  }

  const handleBack = () => setSelectedEmailId(null)

  const apiError = error
    ? error.type === 'auth_expired'
      ? 'Your session has expired.'
      : error.type === 'rate_limit'
        ? 'Gmail is rate-limiting us. Try again in a moment.'
        : 'Something went wrong fetching emails.'
    : null

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-sm border-b border-amber-100 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💌</span>
              <h1 className="text-lg font-bold text-gray-800">Email Time Capsule</h1>
            </div>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-800 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Time picker — always visible when no email is selected */}
          {!selectedEmail && (
            <div className="flex justify-center mb-8">
              <TimePicker onSearch={handleSearch} />
            </div>
          )}

          {/* Error display */}
          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-center text-red-600">
              {apiError}
              {error?.type === 'auth_expired' && (
                <button
                  onClick={login}
                  className="ml-3 underline font-medium cursor-pointer"
                >
                  Reconnect
                </button>
              )}
            </div>
          )}

          {/* Loading state */}
          {loading && <LoadingState />}

          {/* Email viewer (selected email) */}
          {!loading && selectedEmail && (
            <EmailViewer email={selectedEmail} onClose={handleBack} />
          )}

          {/* Email list */}
          {!loading && !selectedEmail && hasSearched && (
            <EmailList
              emails={emails}
              onSelect={setSelectedEmailId}
              onShowMore={fetchMore}
              onShuffle={shuffle}
              hasMore={hasMore}
            />
          )}
        </main>

        {/* Footer */}
        <footer className="text-center py-6 text-xs text-gray-400">
          Your emails never leave your browser. We don't store, send, or log anything.
        </footer>
      </div>
    </ErrorBoundary>
  )
}

export default App
