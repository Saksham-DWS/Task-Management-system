import api from './api'

export const aiService = {
  getProjectInsights: async (projectId) => {
    const response = await api.get(`/ai/projects/${projectId}/insights`)
    return response.data
  },

  getCategoryInsights: async (categoryId) => {
    const response = await api.get(`/ai/categories/${categoryId}/insights`)
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
    const response = await api.get('/ai/insights')
    return response.data
  }
}
