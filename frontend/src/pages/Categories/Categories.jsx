import { useState, useEffect } from 'react'
import { Plus, Search } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAccess } from '../../hooks/useAccess'
import { categoryService } from '../../services/category.service'
import api from '../../services/api'
import CategoryCard from '../../components/Cards/CategoryCard'
import NewCategoryModal from '../../components/Modals/NewCategoryModal'
import EditCategoryModal from '../../components/Modals/EditCategoryModal'

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const { activeModal, modalData, openModal } = useUIStore()
  const { isManager } = useAccess()

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    setLoading(true)
    try {
      const [categoryData, usersRes] = await Promise.all([
        categoryService.getAll(),
        api.get('/users')
      ])
      const usersData = usersRes.data || []
      const accessMap = new Map()
      usersData.forEach((user) => {
        const categoryIds = user.access?.category_ids || []
        categoryIds.forEach((categoryId) => {
          if (!accessMap.has(categoryId)) {
            accessMap.set(categoryId, [])
          }
          accessMap.get(categoryId).push(user)
        })
      })
      const categoriesWithAccess = categoryData.map((category) => ({
        ...category,
        accessUsers: accessMap.get(category._id) || []
      }))
      setUsers(usersData)
      setCategories(categoriesWithAccess)
    } catch (error) {
      console.error('Failed to load categories:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCategory = async (formData) => {
    try {
      const { accessUserIds = [], ...categoryData } = formData
      const newCategory = await categoryService.create(categoryData)
      let accessUsers = []
      if (accessUserIds.length > 0) {
        accessUsers = users.filter((user) => accessUserIds.includes(user._id))
        try {
          await Promise.all(
            accessUserIds.map((userId) =>
              api.post(`/users/access/${userId}/category`, { itemId: newCategory._id })
            )
          )
        } catch (accessError) {
          console.error('Failed to grant category access:', accessError)
        }
      }
      setCategories((prev) => [...prev, { ...newCategory, accessUsers }])
    } catch (error) {
      console.error('Failed to create category:', error)
      throw error
    }
  }

  const handleUpdateCategory = async (categoryId, formData) => {
    try {
      const currentCategory = categories.find((cat) => cat._id === categoryId)
      const { accessUserIds = [], ...categoryData } = formData
      const currentAccessIds = new Set((currentCategory?.accessUsers || []).map((user) => user._id))
      const newAccessSet = new Set(accessUserIds)

      const toAdd = accessUserIds.filter((id) => !currentAccessIds.has(id))
      const toRemove = [...currentAccessIds].filter((id) => !newAccessSet.has(id))

      const updatedCategory = await categoryService.update(categoryId, categoryData)

      const accessRequests = [
        ...toAdd.map((userId) => api.post(`/users/access/${userId}/category`, { itemId: categoryId })),
        ...toRemove.map((userId) => api.delete(`/users/access/${userId}/category/${categoryId}`))
      ]

      if (accessRequests.length > 0) {
        await Promise.all(accessRequests)
      }

      setUsers((prevUsers) =>
        prevUsers.map((user) => {
          const categoryIds = user.access?.category_ids || []
          if (toAdd.includes(user._id)) {
            return {
              ...user,
              access: {
                ...(user.access || {}),
                category_ids: Array.from(new Set([...categoryIds, categoryId]))
              }
            }
          }
          if (toRemove.includes(user._id)) {
            return {
              ...user,
              access: {
                ...(user.access || {}),
                category_ids: categoryIds.filter((id) => id !== categoryId)
              }
            }
          }
          return user
        })
      )

      const updatedAccessUsers = users.filter((user) => newAccessSet.has(user._id))

      setCategories((prev) =>
        prev.map((cat) =>
          cat._id === categoryId
            ? { ...updatedCategory, accessUsers: updatedAccessUsers }
            : cat
        )
      )
    } catch (error) {
      console.error('Failed to update category:', error)
      throw error
    }
  }

  const handleOpenEdit = (category) => {
    openModal('editCategory', { category })
  }

  const handleDeleteCategory = async (categoryId) => {
    try {
      await categoryService.delete(categoryId, true)

      // Remove category from list
      setCategories((prev) => prev.filter((cat) => cat._id !== categoryId))

      // Remove category access from users in local state
      setUsers((prevUsers) =>
        prevUsers.map((user) => {
          const categoryIds = user.access?.category_ids || []
          return {
            ...user,
            access: {
              ...(user.access || {}),
              category_ids: categoryIds.filter((id) => id !== categoryId)
            }
          }
        })
      )
    } catch (error) {
      console.error('Failed to delete category:', error)
      throw error
    }
  }

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-gray-500 mt-1">Organize your projects by business areas</p>
        </div>
        {isManager() && (
          <button 
            onClick={() => openModal('newCategory')}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            New Category
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Search categories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Categories Grid */}
      {filteredCategories.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCategories.map(category => (
            <CategoryCard 
              key={category._id} 
              category={category} 
              canEdit={isManager()}
              onEdit={handleOpenEdit}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          {searchQuery ? (
            <>
              <p className="text-gray-500 mb-2">No categories match your search</p>
              <button 
                onClick={() => setSearchQuery('')}
                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-500 mb-4">No categories yet. Create your first category to get started.</p>
              {isManager() && (
                <button 
                  onClick={() => openModal('newCategory')}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Plus size={16} />
                  Create Category
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal */}
      {activeModal === 'newCategory' && (
        <NewCategoryModal onSubmit={handleCreateCategory} users={users} />
      )}

      {activeModal === 'editCategory' && modalData?.category && (
        <EditCategoryModal
          category={modalData.category}
          users={users}
          onSubmit={handleUpdateCategory}
          onDelete={handleDeleteCategory}
        />
      )}
    </div>
  )
}
