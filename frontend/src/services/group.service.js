import api from './api'

const normalizeGroup = (group) => {
  if (!group) return group
  return {
    ...group,
    projectCount: group.projectCount ?? group.project_count ?? 0,
    weeklyGoals: group.weeklyGoals || group.weekly_goals || [],
    weeklyAchievements: group.weeklyAchievements || group.weekly_achievements || [],
    ownerId: group.ownerId || group.owner_id
  }
}

const normalizeGroups = (groups) => groups.map(normalizeGroup)

export const groupService = {
  getAll: async () => {
    const response = await api.get('/groups')
    return normalizeGroups(response.data)
  },

  getById: async (id) => {
    const response = await api.get(`/groups/${id}`)
    return normalizeGroup(response.data)
  },

  create: async (groupData) => {
    const response = await api.post('/groups', groupData)
    return normalizeGroup(response.data)
  },

  update: async (id, groupData) => {
    const response = await api.put(`/groups/${id}`, groupData)
    return normalizeGroup(response.data)
  },

  delete: async (id, force = false) => {
    const response = await api.delete(`/groups/${id}?force=${force}`)
    return response.data
  },

  updateGoals: async (id, goals) => {
    const response = await api.put(`/groups/${id}/goals`, { goals })
    return normalizeGroup(response.data)
  },

  updateAchievements: async (id, achievements) => {
    const response = await api.put(`/groups/${id}/achievements`, { achievements })
    return normalizeGroup(response.data)
  },

  getInsights: async (id) => {
    const response = await api.get(`/groups/${id}/insights`)
    return response.data
  }
}
