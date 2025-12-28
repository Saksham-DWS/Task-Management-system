import { useState, useEffect } from 'react'
import { Plus, Search, Shield, Trash2, Edit2, X, Check } from 'lucide-react'
import { getInitials, getAvatarColor } from '../../utils/helpers'
import { USER_ROLES } from '../../utils/constants'
import { useAuthStore } from '../../store/auth.store'
import api from '../../services/api'

export default function TeamsAccess() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showEditUser, setShowEditUser] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: USER_ROLES.USER })
  const [editUser, setEditUser] = useState({ name: '', email: '' })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, categoriesRes] = await Promise.all([
        api.get('/users'),
        api.get('/categories')
      ])
      setUsers(usersRes.data)
      setCategories(categoriesRes.data)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    try {
      const response = await api.post('/users', newUser)
      setUsers([...users, response.data])
      setNewUser({ name: '', email: '', password: '', role: USER_ROLES.USER })
      setShowAddUser(false)
    } catch (error) {
      console.error('Failed to add user:', error)
      alert(error.response?.data?.detail || 'Failed to add user')
    }
  }

  const handleEditUser = async (e) => {
    e.preventDefault()
    try {
      const response = await api.put(`/users/${selectedUser._id}`, editUser)
      setUsers(users.map(u => u._id === selectedUser._id ? response.data : u))
      setSelectedUser(response.data)
      setShowEditUser(false)
    } catch (error) {
      console.error('Failed to update user:', error)
      alert(error.response?.data?.detail || 'Failed to update user')
    }
  }

  const handleDeleteUser = async () => {
    try {
      await api.delete(`/users/${selectedUser._id}`)
      setUsers(users.filter(u => u._id !== selectedUser._id))
      setSelectedUser(null)
      setShowDeleteConfirm(false)
    } catch (error) {
      console.error('Failed to delete user:', error)
      alert(error.response?.data?.detail || 'Failed to delete user')
    }
  }

  const handleCategoryAccess = async (userId, categoryId, grant) => {
    try {
      if (grant) {
        await api.post(`/users/access/${userId}/category`, { itemId: categoryId })
      } else {
        await api.delete(`/users/access/${userId}/category/${categoryId}`)
      }
      // Refresh user data
      const response = await api.get(`/users/${userId}`)
      setUsers(users.map(u => u._id === userId ? response.data : u))
      if (selectedUser?._id === userId) {
        setSelectedUser(response.data)
      }
    } catch (error) {
      console.error('Failed to update access:', error)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/users/${userId}/role`, { role: newRole })
      setUsers(users.map(u => u._id === userId ? { ...u, role: newRole } : u))
      if (selectedUser?._id === userId) {
        setSelectedUser({ ...selectedUser, role: newRole })
      }
    } catch (error) {
      console.error('Failed to update role:', error)
      alert(error.response?.data?.detail || 'Failed to update role')
    }
  }

  const hasCategoryAccess = (user, categoryId) => {
    return user?.access?.category_ids?.includes(categoryId) || false
  }

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case USER_ROLES.ADMIN: return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
      case USER_ROLES.MANAGER: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const isAdmin = currentUser?.role === USER_ROLES.ADMIN

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Teams & Access</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage users and their access permissions</p>
        </div>
        <button 
          onClick={() => setShowAddUser(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Add User
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List */}
        <div className="lg:col-span-1">
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Users ({filteredUsers.length})</h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredUsers.map(user => (
                <button
                  key={user._id}
                  onClick={() => setSelectedUser(user)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    selectedUser?._id === user._id 
                      ? 'bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${getAvatarColor(user.name)}`}>
                    {getInitials(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadgeClass(user.role)}`}>
                    {user.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Access Panel */}
        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="card">
              {/* User Header */}
              <div className="flex items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-700 mb-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl ${getAvatarColor(selectedUser.name)}`}>
                  {getInitials(selectedUser.name)}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{selectedUser.name}</h2>
                  <p className="text-gray-500 dark:text-gray-400">{selectedUser.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Role</label>
                    <select
                      value={selectedUser.role}
                      onChange={(e) => handleRoleChange(selectedUser._id, e.target.value)}
                      className="input-field py-1.5"
                      disabled={!isAdmin}
                    >
                      <option value={USER_ROLES.USER}>User</option>
                      <option value={USER_ROLES.MANAGER}>Manager</option>
                      <option value={USER_ROLES.ADMIN}>Admin</option>
                    </select>
                  </div>
                  {isAdmin && selectedUser._id !== currentUser?._id && (
                    <>
                      <button
                        onClick={() => {
                          setEditUser({ name: selectedUser.name, email: selectedUser.email })
                          setShowEditUser(true)
                        }}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                        title="Edit user"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600"
                        title="Delete user"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Access Info */}
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Shield className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-200">Simplified Access Control</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      Grant access to categories. Users with category access can see all projects and tasks within that category.
                      For specific task access, add users as collaborators on individual tasks.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category Access */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Category Access</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Select categories this user can access. They will automatically have access to all projects and tasks within selected categories.
                </p>
                
                {categories.length > 0 ? (
                  <div className="space-y-2">
                    {categories.map(category => {
                      const hasAccess = hasCategoryAccess(selectedUser, category._id)
                      return (
                        <div
                          key={category._id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            hasAccess 
                              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' 
                              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold"
                              style={{ backgroundColor: category.color || '#6366f1' }}
                            >
                              {category.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{category.name}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {category.projects?.length || 0} projects
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCategoryAccess(selectedUser._id, category._id, !hasAccess)}
                            className={`p-2 rounded-lg transition-colors ${
                              hasAccess 
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 hover:bg-green-200' 
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            <Check size={20} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No categories available</p>
                )}
              </div>
            </div>
          ) : (
            <div className="card flex items-center justify-center h-64">
              <p className="text-gray-500 dark:text-gray-400">Select a user to manage their access</p>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add New User</h3>
              <button onClick={() => setShowAddUser(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="input-field"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="input-field"
                >
                  <option value={USER_ROLES.USER}>User</option>
                  <option value={USER_ROLES.MANAGER}>Manager</option>
                  <option value={USER_ROLES.ADMIN}>Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddUser(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit User</h3>
              <button onClick={() => setShowEditUser(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={editUser.name}
                  onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={editUser.email}
                  onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditUser(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete User</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Are you sure you want to delete <strong>{selectedUser?.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleDeleteUser} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex-1">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
