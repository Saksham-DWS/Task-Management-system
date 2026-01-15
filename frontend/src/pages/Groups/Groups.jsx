import { useState, useEffect } from 'react'
import { Plus, Search } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAccess } from '../../hooks/useAccess'
import { useAuthStore } from '../../store/auth.store'
import { groupService } from '../../services/group.service'
import api from '../../services/api'
import GroupCard from '../../components/Cards/GroupCard'
import NewGroupModal from '../../components/Modals/NewGroupModal'
import EditGroupModal from '../../components/Modals/EditGroupModal'

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const { activeModal, modalData, openModal } = useUIStore()
  const { isManager, userAccess } = useAccess()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  const normalizeAccessIds = (ids) => {
    if (!Array.isArray(ids)) return []
    return ids.map((id) => String(id || '')).filter(Boolean)
  }

  const canSeeGroup = (group) => {
    if (!group || !user) return false
    if (isAdmin) return true
    const userId = String(user?._id || user?.id || '')
    const groupId = String(group._id || group.id || '')
    const ownerId = String(group.owner_id || group.ownerId || '')
    if (ownerId && ownerId === userId) return true
    const accessIds = new Set([
      ...normalizeAccessIds(userAccess?.groupIds),
      ...normalizeAccessIds(userAccess?.group_ids)
    ])
    return accessIds.has(groupId)
  }

  const accessSignature = [
    ...normalizeAccessIds(userAccess?.groupIds),
    ...normalizeAccessIds(userAccess?.group_ids)
  ].sort().join('|')

  useEffect(() => {
    if (!user) return
    loadGroups()
  }, [user?._id, user?.role, accessSignature])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const [groupData, usersRes] = await Promise.all([
        groupService.getAll(),
        api.get('/users')
      ])
      const usersData = usersRes.data || []
      const accessMap = new Map()
      usersData.forEach((user) => {
        const groupIds = user.access?.group_ids || []
        groupIds.forEach((groupId) => {
          if (!accessMap.has(groupId)) {
            accessMap.set(groupId, [])
          }
          accessMap.get(groupId).push(user)
        })
      })
      const visibleGroups = groupData.filter(canSeeGroup)
      const groupsWithAccess = visibleGroups.map((group) => ({
        ...group,
        accessUsers: accessMap.get(group._id) || []
      }))
      setUsers(usersData)
      setGroups(groupsWithAccess)
    } catch (error) {
      console.error('Failed to load groups:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async (formData) => {
    try {
      const { accessUserIds = [], ...groupData } = formData
      const newGroup = await groupService.create(groupData)
      let accessUsers = []
      if (accessUserIds.length > 0) {
        accessUsers = users.filter((user) => accessUserIds.includes(user._id))
        try {
          await Promise.all(
            accessUserIds.map((userId) =>
              api.post(`/users/access/${userId}/group`, { itemId: newGroup._id })
            )
          )
        } catch (accessError) {
          console.error('Failed to grant group access:', accessError)
        }
      }
      setGroups((prev) => [...prev, { ...newGroup, accessUsers }])
    } catch (error) {
      console.error('Failed to create group:', error)
      throw error
    }
  }

  const handleUpdateGroup = async (groupId, formData) => {
    try {
      const currentGroup = groups.find((cat) => cat._id === groupId)
      const { accessUserIds = [], ...groupData } = formData
      const currentAccessIds = new Set((currentGroup?.accessUsers || []).map((user) => user._id))
      const newAccessSet = new Set(accessUserIds)

      const toAdd = accessUserIds.filter((id) => !currentAccessIds.has(id))
      const toRemove = [...currentAccessIds].filter((id) => !newAccessSet.has(id))

      const updatedGroup = await groupService.update(groupId, groupData)

      const accessRequests = [
        ...toAdd.map((userId) => api.post(`/users/access/${userId}/group`, { itemId: groupId })),
        ...toRemove.map((userId) => api.delete(`/users/access/${userId}/group/${groupId}`))
      ]

      if (accessRequests.length > 0) {
        await Promise.all(accessRequests)
      }

      setUsers((prevUsers) =>
        prevUsers.map((user) => {
          const groupIds = user.access?.group_ids || []
          if (toAdd.includes(user._id)) {
            return {
              ...user,
              access: {
                ...(user.access || {}),
                group_ids: Array.from(new Set([...groupIds, groupId]))
              }
            }
          }
          if (toRemove.includes(user._id)) {
            return {
              ...user,
              access: {
                ...(user.access || {}),
                group_ids: groupIds.filter((id) => id !== groupId)
              }
            }
          }
          return user
        })
      )

      const updatedAccessUsers = users.filter((user) => newAccessSet.has(user._id))

      setGroups((prev) =>
        prev.map((cat) =>
          cat._id === groupId
            ? { ...updatedGroup, accessUsers: updatedAccessUsers }
            : cat
        )
      )
    } catch (error) {
      console.error('Failed to update group:', error)
      throw error
    }
  }

  const handleOpenEdit = (group) => {
    openModal('editGroup', { group })
  }

  const canDeleteGroup = (group) => {
    if (isAdmin) return true
    if (user?.role !== 'manager') return false
    return String(group?.owner_id || '') === String(user?._id || '')
  }

  const handleDeleteGroup = async (groupId) => {
    try {
      await groupService.delete(groupId, true)

      // Remove group from list
      setGroups((prev) => prev.filter((cat) => cat._id !== groupId))

      // Remove group access from users in local state
      setUsers((prevUsers) =>
        prevUsers.map((user) => {
          const groupIds = user.access?.group_ids || []
          return {
            ...user,
            access: {
              ...(user.access || {}),
              group_ids: groupIds.filter((id) => id !== groupId)
            }
          }
        })
      )
    } catch (error) {
      console.error('Failed to delete group:', error)
      throw error
    }
  }

  const filteredGroups = groups.filter(cat =>
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Groups</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Organize your projects by business areas</p>
        </div>
        {isManager() && (
          <button 
            onClick={() => openModal('newGroup')}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            New Group
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
        <input
          type="text"
          placeholder="Search groups..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-500"
        />
      </div>

      {/* Groups Grid */}
      {filteredGroups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map(group => (
            <GroupCard 
              key={group._id} 
              group={group} 
              canEdit={isManager()}
              onEdit={handleOpenEdit}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          {searchQuery ? (
            <>
              <p className="text-gray-500 dark:text-gray-400 mb-2">No groups match your search</p>
              <button 
                onClick={() => setSearchQuery('')}
                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-500 dark:text-gray-400 mb-4">No groups yet. Create your first group to get started.</p>
              {isManager() && (
                <button 
                  onClick={() => openModal('newGroup')}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Plus size={16} />
                  Create Group
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal */}
      {activeModal === 'newGroup' && (
        <NewGroupModal onSubmit={handleCreateGroup} users={users} />
      )}

      {activeModal === 'editGroup' && modalData?.group && (
        <EditGroupModal
          group={modalData.group}
          users={users}
          onSubmit={handleUpdateGroup}
          onDelete={handleDeleteGroup}
          canDelete={canDeleteGroup(modalData.group)}
        />
      )}
    </div>
  )
}
