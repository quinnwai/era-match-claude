import { useState, useEffect, useCallback } from 'react'
import { initGoogleAuth, signIn, signOut as authSignOut, getToken } from '../services/auth'

export function useAuth() {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    initGoogleAuth()
      .then(() => setLoading(false))
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const login = useCallback(async () => {
    setError(null)
    try {
      const accessToken = await signIn()
      setToken(accessToken)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const logout = useCallback(() => {
    authSignOut()
    setToken(null)
  }, [])

  return {
    isAuthenticated: !!token,
    token,
    loading,
    error,
    login,
    logout,
  }
}
