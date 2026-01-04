import { USER_ROLES } from './constants'

// Check if user has group-level access
const getGroupIds = (userAccess) => (
  userAccess?.groupIds || userAccess?.group_ids || []
)

const getProjectIds = (userAccess) => (
  userAccess?.projectIds || userAccess?.project_ids || []
)

const getTaskIds = (userAccess) => (
  userAccess?.taskIds || userAccess?.task_ids || []
)

export const canViewGroup = (userAccess, groupId) => {
  if (!userAccess) return false
  return getGroupIds(userAccess).includes(groupId) || userAccess.role === USER_ROLES.ADMIN
}

// Check if user has project-level access
export const canViewProject = (userAccess, projectId, groupId) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getGroupIds(userAccess).includes(groupId)) return true
  return getProjectIds(userAccess).includes(projectId)
}

// Check if user has task-level access
export const canViewTask = (userAccess, taskId, projectId, groupId) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getGroupIds(userAccess).includes(groupId)) return true
  if (getProjectIds(userAccess).includes(projectId)) return true
  return getTaskIds(userAccess).includes(taskId)
}

// Check if user can create in group
export const canCreateInGroup = (userAccess, groupId) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (userAccess.role === USER_ROLES.MANAGER) return true
  return getGroupIds(userAccess).includes(groupId)
}

// Check if user can create in project
export const canCreateInProject = (userAccess, projectId, groupId) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getGroupIds(userAccess).includes(groupId)) return true
  return getProjectIds(userAccess).includes(projectId)
}

// Check if user can edit task
export const canEditTask = (userAccess, task) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getGroupIds(userAccess).includes(task.groupId)) return true
  if (getProjectIds(userAccess).includes(task.projectId)) return true
  const userId = userAccess.userId
  const isAssignee = Array.isArray(task.assignees) && task.assignees.some(a => (a._id || a.id) === userId)
  const isCollaborator = Array.isArray(task.collaborators) && task.collaborators.some(c => (c._id || c.id) === userId)
  if (isAssignee || isCollaborator) return true
  // Task-level users can only update status and add comments
  return getTaskIds(userAccess).includes(task._id)
}

// Check if user can delete task
export const canDeleteTask = (userAccess, task) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getGroupIds(userAccess).includes(task.groupId)) return true
  return getProjectIds(userAccess).includes(task.projectId)
}

// Check if user can manage team/access
export const canManageAccess = (userAccess) => {
  if (!userAccess) return false
  return userAccess.role === USER_ROLES.ADMIN || userAccess.role === USER_ROLES.MANAGER
}

// Get user's access level for display
export const getAccessLevel = (userAccess, groupId, projectId, taskId) => {
  if (!userAccess) return null
  if (userAccess.role === USER_ROLES.ADMIN) return 'admin'
  if (getGroupIds(userAccess).includes(groupId)) return 'group'
  if (getProjectIds(userAccess).includes(projectId)) return 'project'
  if (getTaskIds(userAccess).includes(taskId)) return 'task'
  return null
}
