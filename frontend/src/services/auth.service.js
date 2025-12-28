import api from './api'

export const authService = {
  login: async (email, password) => {
    const response = await api.post('/auth/login/json', { email, password })
    return response.data
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData)
    return response.data
  },

  logout: async () => {
    // Just clear local state, no backend call needed
    return { success: true }
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },

  updateProfile: async (userData) => {
    const response = await api.put('/auth/profile', userData)
    return response.data
  },

  changePassword: async (oldPassword, newPassword) => {
    const response = await api.put('/auth/password', { oldPassword, newPassword })
    return response.data
  }
}
