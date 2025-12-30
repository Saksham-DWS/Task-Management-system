import { useState } from 'react'
import { useAuthStore } from '../store/auth.store'
import { useAccessStore } from '../store/access.store'
import { authService } from '../services/auth.service'

export const useAuth = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const { login: setAuth, logout: clearAuth, user, isAuthenticated } = useAuthStore()
  const { setAccess, clearAccess } = useAccessStore()

  const login = async (email, password) => {
    setLoading(true)
    setError(null)
    try {
      const response = await authService.login(email, password)
      // Backend returns { access_token, token_type }
      const token = response.access_token
      
      // Fetch user data after getting token
      useAuthStore.getState().setToken(token)
      const userData = await authService.getCurrentUser()
      
      setAuth(userData, token)
      if (userData.access) {
        setAccess(userData.access)
      }
      return { user: userData, token }
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Incorrect login credentials. Please check your credentials again or reset the password with the admin.')
      } else {
        setError(err.response?.data?.detail || 'Login failed')
      }
      throw err
    } finally {
      setLoading(false)
    }
  }

  const register = async (userData) => {
    setLoading(true)
    setError(null)
    try {
      const response = await authService.register(userData)
      const token = response.access_token
      
      useAuthStore.getState().setToken(token)
      const user = await authService.getCurrentUser()
      
      setAuth(user, token)
      return { user, token }
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
    } catch (err) {
      // Ignore logout errors
    } finally {
      clearAuth()
      clearAccess()
    }
  }

  const refreshUser = async () => {
    try {
      const response = await authService.getCurrentUser()
      setAuth(response, useAuthStore.getState().token)
      if (response.access) {
        setAccess(response.access)
      }
    } catch (err) {
      clearAuth()
      clearAccess()
    }
  }

  return {
    user,
    isAuthenticated,
    loading,
    error,
    login,
    register,
    logout,
    refreshUser
  }
}
