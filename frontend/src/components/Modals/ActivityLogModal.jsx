import { X, Clock } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { formatDateTime, getInitials, getAvatarColor } from '../../utils/helpers'

export default function ActivityLogModal({ title = 'Activity Log', activity = [], members = [] }) {
  const { closeModal } = useUIStore()
  const entries = [...activity].sort((a, b) => new Date(b.timestamp || b.time || b.date) - new Date(a.timestamp || a.time || a.date))
  const memberById = new Map()
  members.forEach((member) => {
    if (member?._id) {
      memberById.set(member._id, member)
    }
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-xl mx-4 shadow-xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button 
            onClick={closeModal}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[320px] sm:max-h-[380px] overflow-y-auto">
          {entries.length === 0 && (
            <p className="text-sm text-gray-500">No activity yet.</p>
          )}
          {entries.map((entry, idx) => {
            const displayName = entry.user || memberById.get(entry.user_id)?.name
            return (
              <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                {displayName ? (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs ${getAvatarColor(displayName)}`}>
                    {getInitials(displayName)}
                  </div>
                ) : (
                  <div className="p-2 bg-white rounded-full shadow-sm">
                    <Clock size={16} className="text-gray-500" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm text-gray-900 font-semibold">{entry.description || 'Update'}</p>
                  {displayName && (
                    <p className="text-xs text-gray-500">By {displayName}</p>
                  )}
                  {/* Optionally hide detailed changes since description is clear */}
                  {/* {Array.isArray(entry.changes) && entry.changes.length > 0 && (
                    <div className="text-xs text-gray-500 mt-1 space-y-1">
                      {entry.changes.map((change, idxChange) => (
                        <div key={idxChange}>
                          <span className="font-medium">{change.field || change}</span>
                          {change && typeof change === 'object' && change.before !== undefined && change.after !== undefined && (
                            <>
                              : <span className="text-gray-600">{String(change.before ?? '??"')}</span>
                              {' '}?+{' '}
                              <span className="text-gray-900">{String(change.after ?? '??"')}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )} */}
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDateTime(entry.timestamp || entry.time || entry.date) || entry.timestamp || entry.time || entry.date}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
