import { USER_ROLES } from './constants'

// Check if user has category-level access
const getCategoryIds = (userAccess) => (
  userAccess?.categoryIds || userAccess?.category_ids || []
)

const getProjectIds = (userAccess) => (
  userAccess?.projectIds || userAccess?.project_ids || []
)

const getTaskIds = (userAccess) => (
  userAccess?.taskIds || userAccess?.task_ids || []
)

export const canViewCategory = (userAccess, categoryId) => {
  if (!userAccess) return false
  return getCategoryIds(userAccess).includes(categoryId) || userAccess.role === USER_ROLES.ADMIN
}

// Check if user has project-level access
export const canViewProject = (userAccess, projectId, categoryId) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getCategoryIds(userAccess).includes(categoryId)) return true
  return getProjectIds(userAccess).includes(projectId)
}

// Check if user has task-level access
export const canViewTask = (userAccess, taskId, projectId, categoryId) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getCategoryIds(userAccess).includes(categoryId)) return true
  if (getProjectIds(userAccess).includes(projectId)) return true
  return getTaskIds(userAccess).includes(taskId)
}

// Check if user can create in category
export const canCreateInCategory = (userAccess, categoryId) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (userAccess.role === USER_ROLES.MANAGER) return true
  return getCategoryIds(userAccess).includes(categoryId)
}

// Check if user can create in project
export const canCreateInProject = (userAccess, projectId, categoryId) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getCategoryIds(userAccess).includes(categoryId)) return true
  return getProjectIds(userAccess).includes(projectId)
}

// Check if user can edit task
export const canEditTask = (userAccess, task) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getCategoryIds(userAccess).includes(task.categoryId)) return true
  if (getProjectIds(userAccess).includes(task.projectId)) return true
  // Task-level users can only update status and add comments
  return getTaskIds(userAccess).includes(task._id)
}

// Check if user can delete task
export const canDeleteTask = (userAccess, task) => {
  if (!userAccess) return false
  if (userAccess.role === USER_ROLES.ADMIN) return true
  if (getCategoryIds(userAccess).includes(task.categoryId)) return true
  return getProjectIds(userAccess).includes(task.projectId)
}

// Check if user can manage team/access
export const canManageAccess = (userAccess) => {
  if (!userAccess) return false
  return userAccess.role === USER_ROLES.ADMIN || userAccess.role === USER_ROLES.MANAGER
}

// Get user's access level for display
export const getAccessLevel = (userAccess, categoryId, projectId, taskId) => {
  if (!userAccess) return null
  if (userAccess.role === USER_ROLES.ADMIN) return 'admin'
  if (getCategoryIds(userAccess).includes(categoryId)) return 'category'
  if (getProjectIds(userAccess).includes(projectId)) return 'project'
  if (getTaskIds(userAccess).includes(taskId)) return 'task'
  return null
}
