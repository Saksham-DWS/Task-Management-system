import { useAccessStore } from '../store/access.store'
import { useAuthStore } from '../store/auth.store'
import { 
  canViewGroup, 
  canViewProject, 
  canViewTask,
  canCreateInGroup,
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
    canViewGroup: (groupId) => canViewGroup(access, groupId),
    canViewProject: (projectId, groupId) => canViewProject(access, projectId, groupId),
    canViewTask: (taskId, projectId, groupId) => canViewTask(access, taskId, projectId, groupId),
    canCreateInGroup: (groupId) => canCreateInGroup(access, groupId),
    canCreateInProject: (projectId, groupId) => canCreateInProject(access, projectId, groupId),
    canEditTask: (task) => canEditTask(access, task),
    canDeleteTask: (task) => canDeleteTask(access, task),
    canManageAccess: () => canManageAccess(access),
    
    // Get access level
    getAccessLevel: (groupId, projectId, taskId) => 
      getAccessLevel(access, groupId, projectId, taskId),
    
    // Check if admin
    isAdmin: () => user?.role === 'admin' || user?.role === 'super_admin',
    isManager: () => user?.role === 'manager' || user?.role === 'admin' || user?.role === 'super_admin',
    
    // Raw access data
    userAccess: access
  }
}
