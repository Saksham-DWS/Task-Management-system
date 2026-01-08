import api from './api'

const formatDateForBackend = (dateStr) => {
  if (!dateStr) return null
  if (dateStr.includes('T')) return dateStr
  return `${dateStr}T00:00:00`
}

const statusFromBackend = {
  hold: 'on_hold',
  on_hold: 'on_hold',
  ongoing: 'ongoing',
  completed: 'completed'
}

const statusToBackend = {
  on_hold: 'hold',
  hold: 'hold',
  ongoing: 'ongoing',
  completed: 'completed'
}

const normalizeProject = (project) => {
  if (!project) return project
  const startDate = project.startDate || project.start_date || null
  const endDate = project.endDate || project.end_date || project.dueDate || project.due_date || null
  const accessUserIds = project.accessUserIds || project.access_user_ids || []
  return {
    ...project,
    weeklyGoals: project.weeklyGoals || project.weekly_goals || [],
    accessUserIds,
    accessUsers: project.accessUsers || project.access_users || [],
    collaboratorIds: project.collaboratorIds || project.collaborator_ids || [],
    startDate,
    endDate,
    groupId: project.groupId || project.group_id,
    status: statusFromBackend[project.status] || project.status,
    activity: project.activity || []
  }
}

const normalizeProjects = (projects) => projects.map(normalizeProject)

const normalizeInputDate = (dateStr) => {
  if (!dateStr) return ''
  // Handle dd-mm-yyyy (user typed) -> yyyy-mm-dd
  const dashParts = dateStr.split('-')
  if (dashParts.length === 3 && dashParts[0].length === 2 && dashParts[1].length === 2 && dashParts[2].length === 4) {
    const [dd, mm, yyyy] = dashParts
    return `${yyyy}-${mm}-${dd}`
  }
  return dateStr
}

export const projectService = {
  getAll: async () => {
    const response = await api.get('/projects')
    return normalizeProjects(response.data)
  },

  getById: async (id) => {
    const response = await api.get(`/projects/${id}`)
    return normalizeProject(response.data)
  },

  getByGroup: async (groupId) => {
    const response = await api.get(`/projects/group/${groupId}`)
    return normalizeProjects(response.data)
  },

  create: async (projectData) => {
    // Convert camelCase to snake_case for backend
    const payload = {
      name: projectData.name,
      description: projectData.description,
      group_id: projectData.groupId,
      accessUserIds: projectData.accessUserIds || [],
      collaboratorIds: projectData.collaborators || projectData.collaboratorIds || [],
      status: statusToBackend[projectData.status] || projectData.status,
      startDate: formatDateForBackend(normalizeInputDate(projectData.startDate)),
      endDate: formatDateForBackend(normalizeInputDate(projectData.endDate)),
      start_date: formatDateForBackend(normalizeInputDate(projectData.startDate)),
      end_date: formatDateForBackend(normalizeInputDate(projectData.endDate))
    }
    const response = await api.post('/projects', payload)
    return normalizeProject(response.data)
  },

  update: async (id, projectData) => {
    const payload = {
      ...projectData,
      status: statusToBackend[projectData.status] || projectData.status
    }
    if (projectData.accessUserIds !== undefined) {
      payload.accessUserIds = projectData.accessUserIds
    }
    if (projectData.collaborators !== undefined || projectData.collaboratorIds !== undefined) {
      payload.collaboratorIds = projectData.collaborators || projectData.collaboratorIds || []
    }
    if (projectData.startDate !== undefined) {
      payload.startDate = formatDateForBackend(normalizeInputDate(projectData.startDate))
      payload.start_date = payload.startDate
    }
    if (projectData.endDate !== undefined) {
      payload.endDate = formatDateForBackend(normalizeInputDate(projectData.endDate))
      payload.end_date = payload.endDate
    }
    const response = await api.put(`/projects/${id}`, payload)
    const updated = normalizeProject(response.data)

    // Ensure access is persisted even if the main update omitted it
    if (projectData.accessUserIds !== undefined) {
      try {
        const accessResp = await api.put(`/projects/${id}/access`, { accessUserIds: projectData.accessUserIds })
        return normalizeProject(accessResp.data)
      } catch (err) {
        // Fallback to the earlier response if access update fails
        return updated
      }
    }

    return updated
  },

  delete: async (id, force = false) => {
    const response = await api.delete(`/projects/${id}?force=${force}`)
    return response.data
  },

  updateStatus: async (id, status) => {
    const response = await api.put(`/projects/${id}/status`, { status })
    return response.data
  },

  updateGoals: async (id, goals) => {
    const response = await api.put(`/projects/${id}/goals`, { goals })
    return response.data
  },

  updateAchievements: async (id, achievements) => {
    const response = await api.put(`/projects/${id}/achievements`, { achievements })
    return response.data
  },

  addGoal: async (id, text) => {
    const response = await api.post(`/projects/${id}/goals`, { text })
    return normalizeProject(response.data)
  },

  addAchievement: async (id, goalId, text) => {
    const response = await api.post(`/projects/${id}/goals/${goalId}/achievements`, { text })
    return normalizeProject(response.data)
  },

  updateGoalStatus: async (id, goalId, achieved) => {
    const response = await api.put(`/projects/${id}/goals/${goalId}/status`, { achieved })
    return normalizeProject(response.data)
  },

  getComments: async (id) => {
    const response = await api.get(`/projects/${id}/comments`)
    return response.data
  },

  addComment: async (id, content, attachments = [], parentId = null) => {
    const response = await api.post(`/projects/${id}/comments`, { content, attachments, parent_id: parentId })
    return response.data
  },

  addCollaborator: async (id, userId) => {
    const response = await api.post(`/projects/${id}/collaborators`, { userId })
    return response.data
  },

  removeCollaborator: async (id, userId) => {
    const response = await api.delete(`/projects/${id}/collaborators/${userId}`)
    return response.data
  },

  getInsights: async (id) => {
    const response = await api.get(`/projects/${id}/insights`)
    return response.data
  },

  getTeamLoad: async (id) => {
    const response = await api.get(`/projects/${id}/team-load`)
    return response.data
  }
}
