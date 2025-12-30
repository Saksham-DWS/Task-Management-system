import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, Check } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { PRIORITY, TASK_STATUS } from '../../utils/constants'
import { getInitials, getAvatarColor, getTodayInputDate } from '../../utils/helpers'

// Searchable Multi-Select Dropdown Component
function MultiSelectDropdown({ label, users, selectedIds, onChange, placeholder, required }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(search.toLowerCase()) ||
    user.email.toLowerCase().includes(search.toLowerCase())
  )

  const toggleUser = (userId) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter(id => id !== userId))
    } else {
      onChange([...selectedIds, userId])
    }
  }

  const selectedUsers = users.filter(u => selectedIds.includes(u._id))

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      {/* Selected Users Display / Trigger */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="input-field cursor-pointer flex items-center justify-between min-h-[42px]"
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedUsers.length > 0 ? (
            selectedUsers.map(user => (
              <span 
                key={user._id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs"
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] ${getAvatarColor(user.name)}`}>
                  {getInitials(user.name)}
                </span>
                {user.name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleUser(user._id)
                  }}
                  className="hover:text-primary-900"
                >
                  <X size={12} />
                </button>
              </span>
            ))
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={18} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          {/* User List */}
          <div className="max-h-48 overflow-y-auto">
            {filteredUsers.length > 0 ? (
              filteredUsers.map(user => (
                <div
                  key={user._id}
                  onClick={() => toggleUser(user._id)}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${getAvatarColor(user.name)}`}>
                    {getInitials(user.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                  </div>
                  {selectedIds.includes(user._id) && (
                    <Check size={16} className="text-primary-600" />
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No users found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function NewTaskModal({ projectId, initialStatus, onSubmit, users = [] }) {
  const { closeModal } = useUIStore()
  const todayInputDate = getTodayInputDate()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    projectId: projectId || '',
    status: initialStatus || TASK_STATUS.NOT_STARTED,
    priority: PRIORITY.MEDIUM,
    assignees: [],
    collaborators: [],
    assignedDate: todayInputDate,
    dueDate: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    setError('')
    
    if (!formData.title.trim()) {
      setError('Please enter a task title')
      return
    }

    setLoading(true)
    try {
      console.log('Submitting task:', formData)
      await onSubmit(formData)
      closeModal()
    } catch (err) {
      console.error('Failed to create task:', err)
      setError('Failed to create task: ' + (err.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClick = async () => {
    if (!formData.title.trim()) {
      setError('Please enter a task title')
      return
    }

    setLoading(true)
    setError('')
    try {
      console.log('Creating task:', formData)
      await onSubmit(formData)
      closeModal()
    } catch (err) {
      console.error('Failed to create task:', err)
      setError('Failed to create task: ' + (err.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Task</h2>
          <button 
            type="button"
            onClick={closeModal}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Design homepage mockup"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the task, expected outcome, and any relevant details..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          {/* Assign To - Searchable Multi-Select */}
          <MultiSelectDropdown
            label="Assign To"
            users={users}
            selectedIds={formData.assignees}
            onChange={(ids) => setFormData({ ...formData, assignees: ids })}
            placeholder="Select team members..."
            required={false}
          />

          {/* Collaborators - Searchable Multi-Select */}
          <MultiSelectDropdown
            label="Collaborators (optional)"
            users={users}
            selectedIds={formData.collaborators}
            onChange={(ids) => setFormData({ ...formData, collaborators: ids })}
            placeholder="Select stakeholders..."
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="input-field"
              >
                <option value={PRIORITY.LOW}>Low</option>
                <option value={PRIORITY.MEDIUM}>Medium</option>
                <option value={PRIORITY.HIGH}>High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="input-field"
              >
                <option value={TASK_STATUS.NOT_STARTED}>Not Started</option>
                <option value={TASK_STATUS.IN_PROGRESS}>In Progress</option>
                <option value={TASK_STATUS.HOLD}>On Hold</option>
                <option value={TASK_STATUS.REVIEW}>Review</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Assigned Date
              </label>
              <input
                type="date"
                value={formData.assignedDate}
                onChange={(e) => setFormData({ ...formData, assignedDate: e.target.value })}
                min={todayInputDate}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateClick}
              disabled={loading || !formData.title.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
