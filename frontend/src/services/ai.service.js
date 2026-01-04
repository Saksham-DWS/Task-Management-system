import api from './api'

export const aiService = {
  getProjectInsights: async (projectId) => {
    const response = await api.get(`/ai/projects/${projectId}/insights`)
    return response.data
  },

  generateProjectInsights: async (projectId) => {
    const response = await api.post(`/ai/projects/${projectId}/generate`)
    return response.data
  },

  getGroupInsights: async (groupId) => {
    const response = await api.get(`/ai/groups/${groupId}/insights`)
    return response.data
  },

  getTaskInsights: async (taskId) => {
    const response = await api.get(`/ai/tasks/${taskId}/insights`)
    return response.data
  },

  getGoalsVsAchievements: async (projectId) => {
    const response = await api.get(`/ai/projects/${projectId}/goals-analysis`)
    return response.data
  },

  getHealthScore: async (projectId) => {
    const response = await api.get(`/ai/projects/${projectId}/health-score`)
    return response.data
  },

  getRiskPrediction: async (projectId) => {
    const response = await api.get(`/ai/projects/${projectId}/risk-prediction`)
    return response.data
  },

  getTaskPrioritization: async () => {
    const response = await api.get('/ai/tasks/prioritization')
    return response.data
  },

  getWeeklySummary: async (projectId) => {
    const response = await api.get(`/ai/projects/${projectId}/weekly-summary`)
    return response.data
  },

  getOverallInsights: async () => {
    const response = await api.get('/ai/admin/insights')
    return response.data
  },

  getAdminInsights: async () => {
    const response = await api.get('/ai/admin/insights')
    return response.data
  },

  generateAdminInsights: async () => {
    const response = await api.post('/ai/admin/generate')
    return response.data
  },

  getFilteredAdminInsights: async (filters) => {
    const response = await api.post('/ai/admin/insights/filters', filters)
    return response.data
  }
}
