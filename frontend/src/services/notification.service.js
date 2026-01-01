import api from './api'

const emitNotificationUpdate = () => {
  window.dispatchEvent(new Event('notifications:updated'))
}

export const notificationService = {
  getAll: async () => {
    const response = await api.get('/notifications')
    return response.data || []
  },

  markRead: async (id) => {
    const response = await api.put(`/notifications/${id}/read`)
    emitNotificationUpdate()
    return response.data
  },

  markUnread: async (id) => {
    const response = await api.put(`/notifications/${id}/unread`)
    emitNotificationUpdate()
    return response.data
  },

  markAllRead: async () => {
    const response = await api.put('/notifications/read-all')
    emitNotificationUpdate()
    return response.data
  },

  remove: async (id) => {
    const response = await api.delete(`/notifications/${id}`)
    emitNotificationUpdate()
    return response.data
  },

  getPreferences: async () => {
    const response = await api.get('/notifications/preferences')
    return response.data
  },

  savePreferences: async (preferences) => {
    const response = await api.put('/notifications/preferences', preferences)
    return response.data
  },

  updateUserPreferences: async (userId, preferences) => {
    const response = await api.put(`/notifications/preferences/${userId}`, preferences)
    return response.data
  }
}
