import api from './api'

// Helper to format date for backend (expects ISO datetime)
const formatDateForBackend = (dateStr) => {
  if (!dateStr) return null
  // If it's already a full datetime, return as is
  if (dateStr.includes('T')) return dateStr
  // Otherwise, append time to make it a valid datetime
  return `${dateStr}T00:00:00`
}

const normalizeTask = (task) => {
  if (!task) return task
  const dueDate = task.dueDate || task.due_date || null
  const assignedDate = task.assignedDate || task.assigned_date || null
  return {
    ...task,
    dueDate,
    assignedDate,
    categoryId: task.categoryId || task.category_id,
    projectId: task.projectId || task.project_id
  }
}

const normalizeTasks = (tasks) => tasks.map(normalizeTask)

export const taskService = {
  getAll: async () => {
    const response = await api.get('/tasks')
    return normalizeTasks(response.data)
  },

  getById: async (id) => {
    const response = await api.get(`/tasks/${id}`)
    return normalizeTask(response.data)
  },

  getByProject: async (projectId) => {
    const response = await api.get(`/tasks/project/${projectId}`)
    return normalizeTasks(response.data)
  },

  getMyTasks: async () => {
    const response = await api.get('/tasks/my')
    return normalizeTasks(response.data)
  },

  create: async (taskData) => {
    // Convert camelCase to snake_case for backend
    const payload = {
      title: taskData.title,
      description: taskData.description || null,
      project_id: taskData.projectId,
      status: taskData.status || 'not_started',
      priority: taskData.priority || 'medium',
      assignee_ids: taskData.assignees || [],
      collaborator_ids: taskData.collaborators || [],
      assigned_date: formatDateForBackend(taskData.assignedDate),
      due_date: formatDateForBackend(taskData.dueDate)
    }
    console.log('Sending task payload:', payload)
    const response = await api.post('/tasks', payload)
    return normalizeTask(response.data)
  },

  update: async (id, taskData) => {
    const response = await api.put(`/tasks/${id}`, taskData)
    return normalizeTask(response.data)
  },

  delete: async (id) => {
    const response = await api.delete(`/tasks/${id}`)
    return response.data
  },

  updateStatus: async (id, status) => {
    const response = await api.put(`/tasks/${id}/status`, { status })
    return response.data
  },

  updatePriority: async (id, priority) => {
    const response = await api.put(`/tasks/${id}/priority`, { priority })
    return response.data
  },

  addAssignee: async (id, userId) => {
    const response = await api.post(`/tasks/${id}/assignees`, { userId })
    return response.data
  },

  removeAssignee: async (id, userId) => {
    const response = await api.delete(`/tasks/${id}/assignees/${userId}`)
    return response.data
  },

  addCollaborator: async (id, userId) => {
    const response = await api.post(`/tasks/${id}/collaborators`, { userId })
    return response.data
  },

  removeCollaborator: async (id, userId) => {
    const response = await api.delete(`/tasks/${id}/collaborators/${userId}`)
    return response.data
  },

  addComment: async (id, content, attachments = []) => {
    const response = await api.post(`/tasks/${id}/comments`, { content, attachments })
    return response.data
  },

  getComments: async (id) => {
    const response = await api.get(`/tasks/${id}/comments`)
    return response.data
  },

  updateAchievements: async (id, achievements) => {
    const response = await api.put(`/tasks/${id}/achievements`, { achievements })
    return response.data
  },

  addSubtask: async (id, subtask) => {
    const response = await api.post(`/tasks/${id}/subtasks`, subtask)
    return response.data
  },

  updateSubtask: async (id, subtaskId, completed) => {
    const response = await api.put(`/tasks/${id}/subtasks/${subtaskId}`, { completed })
    return response.data
  }
}
