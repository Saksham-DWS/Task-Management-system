import { useEffect, useState } from 'react'
import { Plus, Search, Shield, Trash2, Edit2, X, Check } from 'lucide-react'
import { getInitials, getAvatarColor } from '../../utils/helpers'
import { USER_ROLES } from '../../utils/constants'
import { useAuthStore } from '../../store/auth.store'
import api from '../../services/api'
import { notificationService } from '../../services/notification.service'

const roleLabel = (role) => {
  if (role === USER_ROLES.SUPER_ADMIN) return 'Super Admin'
  if (role === USER_ROLES.ADMIN) return 'Admin'
  if (role === USER_ROLES.MANAGER) return 'Manager'
  return 'User'
}

const statusValue = (user) => (user?.status || 'active').toLowerCase()

export default function TeamsAccess() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showEditUser, setShowEditUser] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: USER_ROLES.USER })
  const [editUser, setEditUser] = useState({ name: '', email: '', role: USER_ROLES.USER, password: '' })
  const [editRoleOriginal, setEditRoleOriginal] = useState(USER_ROLES.USER)
  const [notificationPrefs, setNotificationPrefs] = useState(null)
  const [savingPrefs, setSavingPrefs] = useState(false)

  const isAdmin = [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(currentUser?.role)
  const isManager = currentUser?.role === USER_ROLES.MANAGER
  const isSuperAdmin = currentUser?.role === USER_ROLES.SUPER_ADMIN
  const canManageUser = (user) => {
    if (isSuperAdmin) return true
    if (isAdmin) return user?.role !== USER_ROLES.SUPER_ADMIN
    if (isManager) return ![USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(user?.role)
    return false
  }

  useEffect(() => {
    loadData()
  }, [])

  const defaultNotificationPrefs = {
    in_app: true,
    email: true,
    task_assigned: true,
    task_completed: true,
    task_comments: true,
    project_comments: true,
    weekly_digest: false
  }

  const normalizePrefs = (prefs = {}) => ({
    in_app: prefs.in_app ?? defaultNotificationPrefs.in_app,
    email: prefs.email ?? defaultNotificationPrefs.email,
    task_assigned: prefs.task_assigned ?? defaultNotificationPrefs.task_assigned,
    task_completed: prefs.task_completed ?? defaultNotificationPrefs.task_completed,
    task_comments: prefs.task_comments ?? defaultNotificationPrefs.task_comments,
    project_comments: prefs.project_comments ?? defaultNotificationPrefs.project_comments,
    weekly_digest: prefs.weekly_digest ?? defaultNotificationPrefs.weekly_digest
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, groupsRes] = await Promise.all([
        api.get('/users'),
        api.get('/groups')
      ])
      setUsers(usersRes.data)
      setGroups(groupsRes.data)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        ...newUser,
        role: isManager ? USER_ROLES.USER : newUser.role
      }
      const response = await api.post('/users', payload)
      setUsers([...users, response.data])
      setNewUser({ name: '', email: '', password: '', role: USER_ROLES.USER })
      setShowAddUser(false)
    } catch (error) {
      console.error('Failed to add user:', error)
      alert(error.response?.data?.detail || 'Failed to add user')
    }
  }

  const handleOpenEdit = (user) => {
    if (!canManageUser(user)) {
      alert('Only super admins can edit super admin accounts.')
      return
    }
    setSelectedUser(user)
    setEditUser({
      name: user.name || '',
      email: user.email || '',
      role: user.role,
      password: ''
    })
    setEditRoleOriginal(user.role)
    setShowEditUser(true)
  }

  useEffect(() => {
    if (selectedUser) {
      setNotificationPrefs(normalizePrefs(selectedUser.notification_preferences))
    } else {
      setNotificationPrefs(null)
    }
  }, [selectedUser?._id])

  const handleSaveNotificationPrefs = async () => {
    if (!selectedUser || !notificationPrefs) return
    setSavingPrefs(true)
    try {
      const response = await notificationService.updateUserPreferences(selectedUser._id, notificationPrefs)
      const updatedUser = { ...selectedUser, notification_preferences: response }
      setUsers(users.map((user) => (user._id === selectedUser._id ? updatedUser : user)))
      setSelectedUser(updatedUser)
    } catch (error) {
      console.error('Failed to update notification preferences:', error)
      alert(error.response?.data?.detail || 'Failed to update notification preferences')
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleEditUser = async (e) => {
    e.preventDefault()
    if (!selectedUser) return

    try {
      const updatePayload = {
        name: editUser.name,
        email: editUser.email
      }
      const response = await api.put(`/users/${selectedUser._id}`, updatePayload)
      let updatedUser = response.data

      if (editUser.role !== editRoleOriginal) {
        const roleResponse = await api.put(`/users/${selectedUser._id}/role`, { role: editUser.role })
        updatedUser = roleResponse.data
      }

      if (editUser.password) {
        await api.put(`/users/${selectedUser._id}/password`, { new_password: editUser.password })
      }

      setUsers(users.map((user) => (user._id === selectedUser._id ? updatedUser : user)))
      setSelectedUser(updatedUser)
      setShowEditUser(false)
    } catch (error) {
      console.error('Failed to update user:', error)
      alert(error.response?.data?.detail || 'Failed to update user')
    }
  }

  const handleDeleteUser = async () => {
    try {
      await api.delete(`/users/${selectedUser._id}`)
      setUsers(users.filter((user) => user._id !== selectedUser._id))
      setSelectedUser(null)
      setShowDeleteConfirm(false)
    } catch (error) {
      console.error('Failed to delete user:', error)
      alert(error.response?.data?.detail || 'Failed to delete user')
    }
  }

  const handleGroupAccess = async (userId, groupId, grant) => {
    try {
      if (grant) {
        await api.post(`/users/access/${userId}/group`, { itemId: groupId })
      } else {
        await api.delete(`/users/access/${userId}/group/${groupId}`)
      }
      const response = await api.get(`/users/${userId}`)
      setUsers(users.map((user) => (user._id === userId ? response.data : user)))
      if (selectedUser?._id === userId) {
        setSelectedUser(response.data)
      }
    } catch (error) {
      console.error('Failed to update access:', error)
    }
  }

  const hasGroupAccess = (user, groupId) => {
    return user?.access?.group_ids?.includes(groupId) || false
  }

  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case USER_ROLES.SUPER_ADMIN:
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      case USER_ROLES.ADMIN:
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
      case USER_ROLES.MANAGER:
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusBadgeClass = (status) => {
    const value = (status || 'active').toLowerCase()
    return value === 'inactive'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!isAdmin && !isManager) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Teams & Access</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Only admins or managers can manage users and access settings.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Teams & Access</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage users and their access permissions</p>
        </div>
        <button onClick={() => setShowAddUser(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          Add User
        </button>
      </div>

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

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Users ({filteredUsers.length})</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to manage access</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left py-3 px-4">Name</th>
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Role</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500 dark:text-gray-400">
                    No users found.
                  </td>
                </tr>
              )}
              {filteredUsers.map((user) => (
                <tr
                  key={user._id}
                  onClick={() => setSelectedUser(user)}
                  className={`cursor-pointer transition-colors ${
                    selectedUser?._id === user._id
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${getAvatarColor(
                          user.name
                        )}`}
                      >
                        {getInitials(user.name)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{user.email}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 text-xs rounded-full ${getRoleBadgeClass(user.role)}`}>
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 text-xs rounded-full ${getStatusBadgeClass(user.status)}`}>
                      {statusValue(user) === 'inactive' ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        handleOpenEdit(user)
                      }}
                      disabled={!canManageUser(user)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                        <Edit2 size={14} />
                        Edit
                      </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedUser(user)
                        setShowDeleteConfirm(true)
                      }}
                      disabled={user._id === currentUser?._id || !canManageUser(user)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="card">
              <div className="flex flex-col gap-4 pb-4 border-b border-gray-200 dark:border-gray-700 mb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl ${getAvatarColor(
                      selectedUser.name
                    )}`}
                  >
                    {getInitials(selectedUser.name)}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{selectedUser.name}</h2>
                    <p className="text-gray-500 dark:text-gray-400">{selectedUser.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`px-2.5 py-1 text-xs rounded-full ${getRoleBadgeClass(selectedUser.role)}`}
                      >
                        {roleLabel(selectedUser.role)}
                      </span>
                      <span
                        className={`px-2.5 py-1 text-xs rounded-full ${getStatusBadgeClass(selectedUser.status)}`}
                      >
                        {statusValue(selectedUser) === 'inactive' ? 'Inactive' : 'Active'}
                      </span>
                    </div>
                  </div>
                </div>
                {selectedUser._id !== currentUser?._id && (
                  <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(selectedUser)}
                    disabled={!canManageUser(selectedUser)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Edit user"
                  >
                      <Edit2 size={18} />
                    </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!canManageUser(selectedUser)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete user"
                  >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Shield className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-200">Simplified Access Control</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      Grant access to groups. Users with group access can see all projects and tasks within that
                      group. For specific task access, add users as collaborators on individual tasks.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Group Access</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Select groups this user can access. They will automatically have access to all projects and tasks
                  within selected groups.
                </p>

                {groups.length > 0 ? (
                  <div className="space-y-2">
                    {groups.map((group) => {
                      const hasAccess = hasGroupAccess(selectedUser, group._id)
                      return (
                        <div
                          key={group._id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            hasAccess
                              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold"
                              style={{ backgroundColor: group.color || '#6366f1' }}
                            >
                              {group.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{group.name}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {group.projects?.length || 0} projects
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleGroupAccess(selectedUser._id, group._id, !hasAccess)}
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
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No groups available</p>
                )}
              </div>

              {notificationPrefs && (
                <div className="mt-8">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Notification Controls</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Define which notification triggers and channels this user receives.
                  </p>
                  <div className="space-y-3">
                    {[
                      { key: 'in_app', label: 'In-App Notifications', desc: 'Show notifications inside the app' },
                      { key: 'email', label: 'Email Notifications', desc: 'Receive notifications via email' },
                      { key: 'task_assigned', label: 'Task Assigned', desc: 'When a task is assigned to this user' },
                      { key: 'task_completed', label: 'Task Completed', desc: 'When tasks they are involved in are completed' },
                      { key: 'task_comments', label: 'Task Comments', desc: 'When someone comments on their tasks' },
                      { key: 'project_comments', label: 'Project Comments', desc: 'When someone comments on their projects' },
                      { key: 'weekly_digest', label: 'Weekly Digest', desc: 'Receive the weekly summary email' }
                    ].map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg cursor-pointer"
                      >
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={notificationPrefs[item.key]}
                          onChange={(e) => setNotificationPrefs({ ...notificationPrefs, [item.key]: e.target.checked })}
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 w-5 h-5"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="pt-4">
                    <button onClick={handleSaveNotificationPrefs} disabled={savingPrefs} className="btn-primary">
                      {savingPrefs ? 'Saving...' : 'Save Notification Settings'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card flex items-center justify-center h-64">
              <p className="text-gray-500 dark:text-gray-400">Select a user to manage their access</p>
            </div>
          )}
        </div>
      </div>

      {showAddUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add New User</h3>
              <button onClick={() => setShowAddUser(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label>
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="input-field"
                  disabled={isManager}
                >
                  <option value={USER_ROLES.USER}>User</option>
                  {isAdmin && <option value={USER_ROLES.MANAGER}>Manager</option>}
                  {isAdmin && <option value={USER_ROLES.ADMIN}>Admin</option>}
                  {isSuperAdmin && <option value={USER_ROLES.SUPER_ADMIN}>Super Admin</option>}
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

      {showEditUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3 mb-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 tracking-[0.2em]">CONTROL CENTER</p>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-1">Edit User</h3>
              </div>
              <button onClick={() => setShowEditUser(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editUser.name}
                  onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={editUser.email}
                  onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Change Password (leave blank to keep current)
                </label>
                <input
                  type="password"
                  value={editUser.password}
                  onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
                  className="input-field"
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
                <select
                  value={editUser.role}
                  onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                  className="input-field"
                  disabled={isManager}
                >
                  <option value={USER_ROLES.USER}>User</option>
                  {isAdmin && <option value={USER_ROLES.MANAGER}>Manager</option>}
                  {isAdmin && <option value={USER_ROLES.ADMIN}>Admin</option>}
                  {isSuperAdmin && <option value={USER_ROLES.SUPER_ADMIN}>Super Admin</option>}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditUser(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete User</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Are you sure you want to delete the user account for{' '}
              <strong className="text-gray-900 dark:text-white">{selectedUser?.name}</strong>? If yes, you will lose all
              user-level data and other data.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex-1"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
