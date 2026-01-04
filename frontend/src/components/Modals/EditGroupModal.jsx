import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import AccessMultiSelect from '../Inputs/AccessMultiSelect'
import ConfirmDeleteModal from './ConfirmDeleteModal'

export default function EditGroupModal({ group, users = [], onSubmit, onDelete }) {
  const { closeModal } = useUIStore()
  const [formData, setFormData] = useState({
    name: group?.name || '',
    description: group?.description || '',
    accessUserIds: group?.accessUsers?.map((user) => user._id) || []
  })
  const [loading, setLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    setFormData({
      name: group?.name || '',
      description: group?.description || '',
      accessUserIds: group?.accessUsers?.map((user) => user._id) || []
    })
  }, [group])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!formData.name.trim() || !group?._id) return

    setLoading(true)
    try {
      await onSubmit(group._id, formData)
      closeModal()
    } catch (error) {
      console.error('Failed to update group:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Edit Group</h2>
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
              Group Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              placeholder="e.g., Marketing, Development, Operations"
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
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              placeholder="Brief description of this group..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          <AccessMultiSelect
            label="Access"
            users={users}
            selectedIds={formData.accessUserIds}
            onChange={(accessUserIds) => setFormData({ ...formData, accessUserIds })}
          />

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium"
            >
              Delete Group
            </button>
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

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          title="Delete Group"
          message="Are you sure you want to delete this group? This will remove all projects and tasks inside it. This action cannot be undone."
          onConfirm={async () => {
            try {
              await onDelete?.(group?._id)
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
