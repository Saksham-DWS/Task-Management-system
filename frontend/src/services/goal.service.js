import api from './api'

const normalizeGoal = (goal) => {
  if (!goal) return goal
  return {
    ...goal,
    id: goal._id || goal.id,
    assignedTo: goal.assigned_to || goal.assignedTo,
    assignedBy: goal.assigned_by || goal.assignedBy,
    assignedToUser: goal.assigned_to_user || goal.assignedToUser,
    assignedByUser: goal.assigned_by_user || goal.assignedByUser,
    assignedAt: goal.assigned_at || goal.assignedAt,
    achievedAt: goal.achieved_at || goal.achievedAt,
    rejectedAt: goal.rejected_at || goal.rejectedAt,
    targetDate: goal.target_date || goal.targetDate,
    targetMonth: goal.target_month || goal.targetMonth,
    userComment: goal.user_comment || goal.userComment,
    managerComment: goal.manager_comment || goal.managerComment,
    rejectionReason: goal.rejection_reason || goal.rejectionReason,
    activity: goal.activity || []
  }
}

const normalizeGoals = (goals = []) => goals.map(normalizeGoal)

export const goalService = {
  getMyGoals: async (params = {}) => {
    const response = await api.get('/goals/my', { params })
    return normalizeGoals(response.data)
  },

  getAssignedGoals: async (params = {}) => {
    const response = await api.get('/goals/assigned', { params })
    return normalizeGoals(response.data)
  },

  getById: async (id) => {
    const response = await api.get(`/goals/${id}`)
    return normalizeGoal(response.data)
  },

  create: async (payload) => {
    const response = await api.post('/goals', payload)
    return normalizeGoal(response.data)
  },

  updateStatus: async (id, status, comment) => {
    const payload = { status }
    if (comment) {
      payload.comment = comment
    }
    const response = await api.put(`/goals/${id}/status`, payload)
    return normalizeGoal(response.data)
  },

  addComment: async (id, comment, commentType) => {
    const payload = { comment }
    if (commentType) {
      payload.comment_type = commentType
    }
    const response = await api.post(`/goals/${id}/comments`, payload)
    return normalizeGoal(response.data)
  },

  delete: async (id) => {
    const response = await api.delete(`/goals/${id}`)
    return response.data
  }
}
