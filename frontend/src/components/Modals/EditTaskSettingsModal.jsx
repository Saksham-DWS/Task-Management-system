import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import AccessMultiSelect from '../Inputs/AccessMultiSelect'

const toInputDate = (value) => {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
  return local.toISOString().split('T')[0]
}

export default function EditTaskSettingsModal({ task, users = [], onSubmit, onClose }) {
  const { closeModal } = useUIStore()
  const [dueDate, setDueDate] = useState('')
  const [assigneeIds, setAssigneeIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!task) return
    const existingDueDate = task.dueDate || task.due_date || ''
    const initialAssignees = [
      ...(task.assignee_ids || task.assigneeIds || []),
      ...((task.assignees || []).map((assignee) => assignee?._id || assignee?.id))
    ]
      .filter(Boolean)
      .map((value) => String(value))
    setDueDate(toInputDate(existingDueDate))
    setAssigneeIds(initialAssignees)
  }, [task])

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const nameA = a?.name || a?.email || ''
      const nameB = b?.name || b?.email || ''
      return nameA.localeCompare(nameB)
    })
  }, [users])

  const handleClose = () => {
    if (onClose) {
      onClose()
    } else {
      closeModal()
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!task || !onSubmit) return
    setSaving(true)
    setError('')
    try {
      await onSubmit({ dueDate, assigneeIds })
      handleClose()
    } catch (err) {
      setError(err?.message || 'Failed to update task settings.')
    } finally {
      setSaving(false)
    }
  }

  if (!task) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Edit Task Settings</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Change due date</label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="input-field flex-1"
              />
              <button
                type="button"
                onClick={() => setDueDate('')}
                className="btn-secondary px-3 py-2 text-sm"
              >
                Clear
              </button>
            </div>
          </div>

          <AccessMultiSelect
            users={sortedUsers}
            selectedIds={assigneeIds}
            onChange={setAssigneeIds}
            label="Move task to"
            maxSelections={1}
            placeholder="Select a user..."
          />

          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
