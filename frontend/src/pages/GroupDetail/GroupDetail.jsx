import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Settings, Trash2 } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAuthStore } from '../../store/auth.store'
import { useAccess } from '../../hooks/useAccess'
import { groupService } from '../../services/group.service'
import { projectService } from '../../services/project.service'
import api from '../../services/api'
import ProjectCard from '../../components/Cards/ProjectCard'
import NewProjectModal from '../../components/Modals/NewProjectModal'
import ConfirmDeleteModal from '../../components/Modals/ConfirmDeleteModal'
import EditGroupModal from '../../components/Modals/EditGroupModal'
import EditProjectModal from '../../components/Modals/EditProjectModal'
import AISummary from '../../components/AI/AISummary'

export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeModal, modalData, openModal, closeModal } = useUIStore()
  const { user } = useAuthStore()
  const { canCreateInGroup, isManager } = useAccess()

  const [group, setGroup] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const canDeleteGroup = isAdmin || (user?.role === 'manager' && String(group?.owner_id || '') === String(user?._id || ''))

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [groupData, projectsData, usersRes, groupsData] = await Promise.all([
        groupService.getById(id),
        projectService.getByGroup(id),
        api.get('/users'),
        groupService.getAll().catch(() => [])
      ])
      const usersData = usersRes.data || []
      const accessUsers = usersData.filter((u) => (u.access?.group_ids || []).includes(id))

      setProjects(projectsData)
      setUsers(usersData)
      setGroups(groupsData || [])
      setGroup({ ...groupData, accessUsers })
      setAccessDenied(false)
    } catch (error) {
      if (error.response?.status === 403) {
        setAccessDenied(true)
        setGroup(null)
        setProjects([])
      } else {
        console.error('Failed to load group:', error)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateGroup = async (groupId, formData) => {
    try {
      const currentGroup = group
      const { accessUserIds = [], ...groupData } = formData
      const currentAccessIds = new Set((currentGroup?.accessUsers || []).map((user) => user._id))
      const newAccessSet = new Set(accessUserIds)

      const toAdd = accessUserIds.filter((userId) => !currentAccessIds.has(userId))
      const toRemove = [...currentAccessIds].filter((userId) => !newAccessSet.has(userId))

      const updatedGroup = await groupService.update(groupId, groupData)

      const accessRequests = [
        ...toAdd.map((userId) => api.post(`/users/access/${userId}/group`, { itemId: groupId })),
        ...toRemove.map((userId) => api.delete(`/users/access/${userId}/group/${groupId}`))
      ]
      if (accessRequests.length > 0) {
        await Promise.all(accessRequests)
      }

      const updatedAccessUsers = users.filter((user) => newAccessSet.has(user._id))
      setGroup({ ...updatedGroup, accessUsers: updatedAccessUsers })
    } catch (error) {
      console.error('Failed to update group:', error)
      throw error
    }
  }

  const handleCreateProject = async (formData) => {
    try {
      const newProject = await projectService.create({ ...formData, groupId: id })
      setProjects([...projects, newProject])
      await loadData()
    } catch (error) {
      console.error('Failed to create project:', error)
      throw error
    }
  }

  const handleUpdateProject = async (projectId, formData) => {
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        startDate: formData.startDate,
        endDate: formData.endDate,
        accessUserIds: formData.accessUserIds || []
      }
      if (formData.collaborators !== undefined) {
        payload.collaborators = formData.collaborators
      }
      if (isAdmin && formData.groupId) {
        payload.groupId = formData.groupId
      }
      const updated = await projectService.update(projectId, payload)
      const updatedGroupId = updated?.group_id || updated?.groupId || ''
      if (updatedGroupId && String(updatedGroupId) !== String(id)) {
        setProjects((prev) => prev.filter((proj) => proj._id !== projectId))
      } else {
        setProjects((prev) =>
          prev.map((proj) => (proj._id === projectId ? updated : proj))
        )
      }
      if (updatedGroupId && String(updatedGroupId) !== String(id)) {
        await loadData()
      }
    } catch (error) {
      console.error('Failed to update project:', error)
      throw error
    }
  }

  const handleDeleteGroup = async () => {
    try {
      await groupService.delete(id, projects.length > 0)
      navigate('/groups')
    } catch (error) {
      console.error('Failed to delete group:', error)
      alert(error.response?.data?.detail || 'Failed to delete group')
      throw error
    }
  }

  const handleOpenEdit = () => {
    if (group) {
      openModal('editGroup', { group })
    }
  }

  const handleOpenProjectEdit = (project) => {
    openModal('editProject', { project })
  }

  const handleDeleteProject = async (projectId) => {
    try {
      await projectService.delete(projectId, true)
      setProjects((prev) => prev.filter((proj) => proj._id !== projectId))
    } catch (error) {
      console.error('Failed to delete project:', error)
      throw error
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 dark:text-gray-400">You do not have access to this group</p>
        <button onClick={() => navigate('/groups')} className="btn-primary mt-4">
          Back to Groups
        </button>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 dark:text-gray-400">Group not found</p>
        <button onClick={() => navigate('/groups')} className="btn-primary mt-4">
          Back to Groups
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/groups')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft size={20} className="dark:text-gray-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{group.name}</h1>
          {group.description && (
            <p className="text-gray-500 dark:text-gray-400 mt-1">{group.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isManager() && (
            <button 
              onClick={handleOpenEdit}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Edit group"
            >
              <Settings size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
          )}
          {canDeleteGroup && (
            <button 
              onClick={() => openModal('deleteGroup')}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 transition-colors"
              title="Delete group"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Projects ({projects.length})
            </h2>
            {canCreateInGroup(id) && (
              <button 
                onClick={() => openModal('newProject')}
                className="btn-primary flex items-center gap-2"
              >
                <Plus size={18} />
                New Project
              </button>
            )}
          </div>

          {projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map(project => (
                <ProjectCard 
                  key={project._id} 
                  project={project} 
                  canEdit={canCreateInGroup(id) || isManager()}
                  onEdit={handleOpenProjectEdit}
                />
              ))}
            </div>
          ) : (
            <div className="card text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 mb-4">No projects in this group yet</p>
              {canCreateInGroup(id) && (
                <button 
                  onClick={() => openModal('newProject')}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Plus size={16} />
                  Create Project
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <AISummary 
            title="Group Insights"
            insights={[
              { type: 'insight', message: `${projects.length} active projects in this group` }
            ]}
          />
        </div>
      </div>
      {/* Modals */}
      {activeModal === 'newProject' && (
        <NewProjectModal 
          groupId={id}
          onSubmit={handleCreateProject}
          users={users}
        />
      )}

      {activeModal === 'deleteGroup' && (
        <ConfirmDeleteModal
          title="Delete Group"
          message={
            projects.length > 0
              ? `Are you sure you want to delete "${group.name}"? This will also delete ${projects.length} project(s) and all their tasks. This action cannot be undone.`
              : `Are you sure you want to delete "${group.name}"? This action cannot be undone.`
          }
          onConfirm={handleDeleteGroup}
          onClose={() => closeModal()}
        />
      )}

      {activeModal === 'editGroup' && modalData?.group && (
        <EditGroupModal
          group={{ ...group, accessUsers: group?.accessUsers || [] }}
          users={users}
          onSubmit={handleUpdateGroup}
          onDelete={handleDeleteGroup}
          canDelete={canDeleteGroup}
        />
      )}

      {activeModal === 'editProject' && modalData?.project && (
        <EditProjectModal
          project={modalData.project}
          onSubmit={handleUpdateProject}
          onDelete={handleDeleteProject}
          users={users}
          groups={groups}
          canMoveGroup={isAdmin}
          canDelete={
            isAdmin ||
            (user?.role === 'manager' &&
              String(modalData.project?.owner_id || '') === String(user?._id || ''))
          }
        />
      )}
    </div>
  )
}
