import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAccess } from '../../hooks/useAccess'
import ProjectCard from '../../components/Cards/ProjectCard'
import EditProjectModal from '../../components/Modals/EditProjectModal'
import { projectService } from '../../services/project.service'
import api from '../../services/api'

export default function Projects() {
  const { activeModal, openModal, closeModal, modalData } = useUIStore()
  const { canCreateInProject, isManager } = useAccess()

  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [projectData, usersRes] = await Promise.all([
        projectService.getAll(),
        api.get('/users').then(res => res.data).catch(() => [])
      ])
      setProjects(projectData || [])
      setUsers(usersRes || [])
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenEdit = (project) => {
    openModal('editProject', { project })
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
      const updated = await projectService.update(projectId, payload)
      setProjects((prev) => prev.map((proj) => (proj._id === projectId ? updated : proj)))
      await loadData()
    } catch (error) {
      console.error('Failed to update project:', error)
      throw error
    }
  }

  const handleDeleteProject = async (projectId) => {
    try {
      await projectService.delete(projectId, true)
      setProjects((prev) => prev.filter((proj) => proj._id !== projectId))
      closeModal()
    } catch (error) {
      console.error('Failed to delete project:', error)
      throw error
    }
  }

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return projects
    return projects.filter((project) => {
      const name = project.name?.toLowerCase() || ''
      const description = project.description?.toLowerCase() || ''
      return name.includes(query) || description.includes(query)
    })
  }, [projects, searchQuery])

  const canEditProject = (project) => {
    const groupId = project.groupId || project.group_id
    return isManager() || canCreateInProject(project._id, groupId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 mt-1">All projects you can access</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project._id}
              project={project}
              canEdit={canEditProject(project)}
              onEdit={handleOpenEdit}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          <p className="text-gray-500 mb-2">No projects to show right now.</p>
          <p className="text-sm text-gray-400">Ask an admin or group owner to grant you project access.</p>
        </div>
      )}

      {activeModal === 'editProject' && modalData?.project && (
        <EditProjectModal
          project={modalData.project}
          onSubmit={handleUpdateProject}
          onDelete={handleDeleteProject}
          users={users}
        />
      )}
    </div>
  )
}
