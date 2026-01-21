import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { PROJECT_STATUS } from '../../utils/constants'
import ConfirmDeleteModal from './ConfirmDeleteModal'
import AccessMultiSelect from '../Inputs/AccessMultiSelect'

const toDateInput = (value) => {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function EditProjectModal({
  project,
  onSubmit,
  onDelete,
  users = [],
  groups = [],
  canDelete = true,
  canMoveGroup = false
}) {
  const { closeModal } = useUIStore()
  const [loading, setLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: PROJECT_STATUS.ONGOING,
    startDate: '',
    endDate: '',
    accessUserIds: [],
    groupId: ''
  })

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        description: project.description || '',
        status: project.status || PROJECT_STATUS.ONGOING,
        startDate: toDateInput(project.startDate || project.start_date),
        endDate: toDateInput(project.endDate || project.end_date),
        accessUserIds: project.accessUserIds || project.access_user_ids || (project.accessUsers || []).map((u) => u._id),
        groupId: project.groupId || project.group_id || ''
      })
    }
  }, [project])

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
  }, [groups])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!project?._id || !formData.name.trim()) return

    setLoading(true)
    try {
      const payload = { ...formData }
      if (!canMoveGroup) {
        delete payload.groupId
      } else if (!payload.groupId && (project?.groupId || project?.group_id)) {
        payload.groupId = project.groupId || project.group_id
      }
      await onSubmit(project._id, payload)
      closeModal()
    } catch (error) {
      console.error('Failed to update project:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">Edit Project</h2>
          <button 
            onClick={closeModal}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Website Redesign, Q1 Campaign"
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this project..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="input-field"
            >
              <option value={PROJECT_STATUS.ONGOING}>Ongoing</option>
              <option value={PROJECT_STATUS.ON_HOLD}>On Hold</option>
              <option value={PROJECT_STATUS.COMPLETED}>Closed</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <AccessMultiSelect
            users={users}
            label="Project Access (project-level owners)"
            selectedIds={formData.accessUserIds}
            onChange={(accessUserIds) => setFormData({ ...formData, accessUserIds })}
          />

          {canMoveGroup && (
            <AccessMultiSelect
              users={sortedGroups}
              label="Move to Another Group"
              selectedIds={formData.groupId ? [formData.groupId] : []}
              onChange={(ids) => setFormData({ ...formData, groupId: ids[0] || '' })}
              maxSelections={1}
              placeholder="Select a group..."
            />
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-4">
            {canDelete ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium"
              >
                Delete Project
              </button>
            ) : (
              <span className="text-xs text-gray-400">Only project owners can delete this project.</span>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.name.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showDeleteConfirm && canDelete && (
        <ConfirmDeleteModal
          title="Delete Project"
          message="Are you sure you want to delete this project? This will remove all tasks and related data under it. This action cannot be undone."
          onConfirm={async () => {
            try {
              await onDelete?.(project?._id)
              closeModal()
            } finally {
              setShowDeleteConfirm(false)
            }
          }}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
