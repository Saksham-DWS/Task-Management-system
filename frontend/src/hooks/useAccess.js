import { useAccessStore } from '../store/access.store'
import { useAuthStore } from '../store/auth.store'
import { 
  canViewCategory, 
  canViewProject, 
  canViewTask,
  canCreateInCategory,
  canCreateInProject,
  canEditTask,
  canDeleteTask,
  canManageAccess,
  getAccessLevel
} from '../utils/permissions'

export const useAccess = () => {
  const { userAccess } = useAccessStore()
  const { user } = useAuthStore()

  const access = {
    ...userAccess,
    role: user?.role,
    userId: user?._id || user?.id
  }

  return {
    // Check permissions
    canViewCategory: (categoryId) => canViewCategory(access, categoryId),
    canViewProject: (projectId, categoryId) => canViewProject(access, projectId, categoryId),
    canViewTask: (taskId, projectId, categoryId) => canViewTask(access, taskId, projectId, categoryId),
    canCreateInCategory: (categoryId) => canCreateInCategory(access, categoryId),
    canCreateInProject: (projectId, categoryId) => canCreateInProject(access, projectId, categoryId),
    canEditTask: (task) => canEditTask(access, task),
    canDeleteTask: (task) => canDeleteTask(access, task),
    canManageAccess: () => canManageAccess(access),
    
    // Get access level
    getAccessLevel: (categoryId, projectId, taskId) => 
      getAccessLevel(access, categoryId, projectId, taskId),
    
    // Check if admin
    isAdmin: () => user?.role === 'admin',
    isManager: () => user?.role === 'manager' || user?.role === 'admin',
    
    // Raw access data
    userAccess: access
  }
}
