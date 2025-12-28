import api from './api'

const normalizeCategory = (category) => {
  if (!category) return category
  return {
    ...category,
    projectCount: category.projectCount ?? category.project_count ?? 0,
    weeklyGoals: category.weeklyGoals || category.weekly_goals || [],
    weeklyAchievements: category.weeklyAchievements || category.weekly_achievements || [],
    ownerId: category.ownerId || category.owner_id
  }
}

const normalizeCategories = (categories) => categories.map(normalizeCategory)

export const categoryService = {
  getAll: async () => {
    const response = await api.get('/categories')
    return normalizeCategories(response.data)
  },

  getById: async (id) => {
    const response = await api.get(`/categories/${id}`)
    return normalizeCategory(response.data)
  },

  create: async (categoryData) => {
    const response = await api.post('/categories', categoryData)
    return normalizeCategory(response.data)
  },

  update: async (id, categoryData) => {
    const response = await api.put(`/categories/${id}`, categoryData)
    return normalizeCategory(response.data)
  },

  delete: async (id, force = false) => {
    const response = await api.delete(`/categories/${id}?force=${force}`)
    return response.data
  },

  updateGoals: async (id, goals) => {
    const response = await api.put(`/categories/${id}/goals`, { goals })
    return normalizeCategory(response.data)
  },

  updateAchievements: async (id, achievements) => {
    const response = await api.put(`/categories/${id}/achievements`, { achievements })
    return normalizeCategory(response.data)
  },

  getInsights: async (id) => {
    const response = await api.get(`/categories/${id}/insights`)
    return response.data
  }
}
