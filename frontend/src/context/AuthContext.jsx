import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import api from '../utils/api'
import { clearImageCache } from '../utils/imageCache'
import { forgetRoutes } from '../offline/store'

const AuthContext = createContext(null)

// A driver's app keeps working without signal, so who is signed in is remembered on the
// device next to the session token (name and role only) and cleared on sign-out
const USER_KEY = 'hopr:user'
function rememberUser(user) {
  try { localStorage.setItem(USER_KEY, JSON.stringify({ _id: user._id, name: user.name, email: user.email, role: user.role })) } catch { /* private mode */ }
}
function rememberedDriver() {
  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY))
    return user?.role === 'driver' ? user : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Set when the session check failed for a reason other than auth (rate limit, server down)
  const [sessionError, setSessionError] = useState(null)

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const response = await api.get('/auth/me')
      setUser(response.data.user)
      rememberUser(response.data.user)
      setSessionError(null)
    } catch (error) {
      // Only an authentication failure ends the session; rate limits or network blips keep it
      if (error.response?.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem(USER_KEY)
        setUser(null)
        setSessionError(null)
      } else if (!error.response && rememberedDriver()) {
        // No signal: carry on as the driver signed in on this phone; checked again online
        setUser(prev => prev || rememberedDriver())
        setSessionError(null)
      } else {
        const retryAfter = Number(error.response?.headers?.['retry-after'])
        setSessionError({ status: error.response?.status ?? null, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
    window.addEventListener('online', fetchUser)
    return () => window.removeEventListener('online', fetchUser)
  }, [fetchUser])

  const login = useCallback(async (email, password) => {
    const response = await api.post('/auth/login', { email, password })
    const { token, user: loggedIn } = response.data
    localStorage.setItem('token', token)
    rememberUser(loggedIn)
    setUser(loggedIn)
    return loggedIn
  }, [])

  const register = useCallback(async (userData) => {
    const response = await api.post('/auth/register', userData)
    const { token, user: created } = response.data
    localStorage.setItem('token', token)
    rememberUser(created)
    setUser(created)
    return created
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem(USER_KEY)
    clearImageCache() // proof photos belong to this session
    forgetRoutes().catch(() => {}) // so do the routes kept for offline use (unsent updates stay)
    setUser(null)
    setSessionError(null)
  }, [])

  const updateUser = useCallback((updates) => {
    setUser(prev => ({ ...prev, ...updates }))
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    sessionError,
    login,
    register,
    logout,
    updateUser,
    refreshUser: fetchUser,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isFleetManager: user?.role === 'fleet_manager',
    isManager: user?.role === 'admin' || user?.role === 'fleet_manager',
    isDriver: user?.role === 'driver'
  }), [user, loading, sessionError, login, register, logout, updateUser, fetchUser])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
