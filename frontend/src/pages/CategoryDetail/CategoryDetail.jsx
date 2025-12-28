import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Settings, Trash2 } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAuthStore } from '../../store/auth.store'
import { useAccess } from '../../hooks/useAccess'
import { categoryService } from '../../services/category.service'
import { projectService } from '../../services/project.service'
import api from '../../services/api'
import ProjectCard from '../../components/Cards/ProjectCard'
import NewProjectModal from '../../components/Modals/NewProjectModal'
import ConfirmDeleteModal from '../../components/Modals/ConfirmDeleteModal'
import EditCategoryModal from '../../components/Modals/EditCategoryModal'
import EditProjectModal from '../../components/Modals/EditProjectModal'
import AISummary from '../../components/AI/AISummary'

export default function CategoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeModal, modalData, openModal, closeModal } = useUIStore()
  const { user } = useAuthStore()
  const { canCreateInCategory, isManager } = useAccess()

  const [category, setCategory] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [users, setUsers] = useState([])

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [categoryData, projectsData, usersRes] = await Promise.all([
        categoryService.getById(id),
        projectService.getByCategory(id),
        api.get('/users')
      ])
      const usersData = usersRes.data || []
      const accessUsers = usersData.filter((u) => (u.access?.category_ids || []).includes(id))

      setProjects(projectsData)
      setUsers(usersData)
      setCategory({ ...categoryData, accessUsers })
      setAccessDenied(false)
    } catch (error) {
      if (error.response?.status === 403) {
        setAccessDenied(true)
        setCategory(null)
        setProjects([])
      } else {
        console.error('Failed to load category:', error)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateCategory = async (categoryId, formData) => {
    try {
      const currentCategory = category
      const { accessUserIds = [], ...categoryData } = formData
      const currentAccessIds = new Set((currentCategory?.accessUsers || []).map((user) => user._id))
      const newAccessSet = new Set(accessUserIds)

      const toAdd = accessUserIds.filter((userId) => !currentAccessIds.has(userId))
      const toRemove = [...currentAccessIds].filter((userId) => !newAccessSet.has(userId))

      const updatedCategory = await categoryService.update(categoryId, categoryData)

      const accessRequests = [
        ...toAdd.map((userId) => api.post(`/users/access/${userId}/category`, { itemId: categoryId })),
        ...toRemove.map((userId) => api.delete(`/users/access/${userId}/category/${categoryId}`))
      ]
      if (accessRequests.length > 0) {
        await Promise.all(accessRequests)
      }

      const updatedAccessUsers = users.filter((user) => newAccessSet.has(user._id))
      setCategory({ ...updatedCategory, accessUsers: updatedAccessUsers })
    } catch (error) {
      console.error('Failed to update category:', error)
      throw error
    }
  }

  const handleCreateProject = async (formData) => {
    try {
      const newProject = await projectService.create({ ...formData, categoryId: id })
      setProjects([...projects, newProject])
      await loadData()
    } catch (error) {
      console.error('Failed to create project:', error)
      throw error
    }
  }

  const handleUpdateProject = async (projectId, formData) => {
    try {
      const updated = await projectService.update(projectId, {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        startDate: formData.startDate,
        endDate: formData.endDate
      })
      setProjects((prev) =>
        prev.map((proj) => (proj._id === projectId ? updated : proj))
      )
    } catch (error) {
      console.error('Failed to update project:', error)
      throw error
    }
  }

  const handleDeleteCategory = async () => {
    try {
      await categoryService.delete(id, projects.length > 0)
      navigate('/categories')
    } catch (error) {
      console.error('Failed to delete category:', error)
      alert(error.response?.data?.detail || 'Failed to delete category')
      throw error
    }
  }

  const handleOpenEdit = () => {
    if (category) {
      openModal('editCategory', { category })
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
        <p className="text-gray-500 dark:text-gray-400">You do not have access to this category</p>
        <button onClick={() => navigate('/categories')} className="btn-primary mt-4">
          Back to Categories
        </button>
      </div>
    )
  }

  if (!category) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 dark:text-gray-400">Category not found</p>
        <button onClick={() => navigate('/categories')} className="btn-primary mt-4">
          Back to Categories
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/categories')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft size={20} className="dark:text-gray-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{category.name}</h1>
          {category.description && (
            <p className="text-gray-500 dark:text-gray-400 mt-1">{category.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isManager() && (
            <button 
              onClick={handleOpenEdit}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Edit category"
            >
              <Settings size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => openModal('deleteCategory')}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 transition-colors"
              title="Delete category"
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
            {canCreateInCategory(id) && (
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
                  canEdit={canCreateInCategory(id) || isManager()}
                  onEdit={handleOpenProjectEdit}
                />
              ))}
            </div>
          ) : (
            <div className="card text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 mb-4">No projects in this category yet</p>
              {canCreateInCategory(id) && (
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
            title="Category Insights"
            insights={[
              { type: 'insight', message: `${projects.length} active projects in this category` }
            ]}
          />
        </div>
      </div>
      {/* Modals */}
      {activeModal === 'newProject' && (
        <NewProjectModal 
          categoryId={id}
          onSubmit={handleCreateProject}
        />
      )}

      {activeModal === 'deleteCategory' && (
        <ConfirmDeleteModal
          title="Delete Category"
          message={
            projects.length > 0
              ? `Are you sure you want to delete "${category.name}"? This will also delete ${projects.length} project(s) and all their tasks. This action cannot be undone.`
              : `Are you sure you want to delete "${category.name}"? This action cannot be undone.`
          }
          onConfirm={handleDeleteCategory}
          onClose={() => closeModal()}
        />
      )}

      {activeModal === 'editCategory' && modalData?.category && (
        <EditCategoryModal
          category={{ ...category, accessUsers: category?.accessUsers || [] }}
          users={users}
          onSubmit={handleUpdateCategory}
          onDelete={handleDeleteCategory}
        />
      )}

      {activeModal === 'editProject' && modalData?.project && (
        <EditProjectModal
          project={modalData.project}
          onSubmit={handleUpdateProject}
          onDelete={handleDeleteProject}
        />
      )}
    </div>
  )
}
