import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const response = await api.get('/auth/me')
      setUser(response.data.user)
    } catch {
      localStorage.removeItem('token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const login = useCallback(async (email, password) => {
    const response = await api.post('/auth/login', { email, password })
    const { token, user: loggedIn } = response.data
    localStorage.setItem('token', token)
    setUser(loggedIn)
    return loggedIn
  }, [])

  const register = useCallback(async (userData) => {
    const response = await api.post('/auth/register', userData)
    const { token, user: created } = response.data
    localStorage.setItem('token', token)
    setUser(created)
    return created
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
  }, [])

  const updateUser = useCallback((updates) => {
    setUser(prev => ({ ...prev, ...updates }))
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
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
  }), [user, loading, login, register, logout, updateUser, fetchUser])

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
