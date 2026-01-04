import { useNavigate } from 'react-router-dom'
import { FolderKanban, Users, Lock, Settings } from 'lucide-react'
import { getInitials, getAvatarColor, calculateProgress } from '../../utils/helpers'
import { AI_HEALTH_COLORS } from '../../utils/constants'

export default function GroupCard({ group, onEdit, canEdit = false }) {
  const navigate = useNavigate()
  const accessUsers = group.accessUsers || []
  const accessInitials = accessUsers
    .map((user) => getInitials(user.name))
    .filter((initials) => initials && initials !== '?')
  
  const progress = calculateProgress(
    group.weeklyAchievements?.length || 0,
    group.weeklyGoals?.length || 0
  )

  const getHealthBadge = () => {
    if (!group.healthStatus) return null
    const colorClass = AI_HEALTH_COLORS[group.healthStatus] || 'text-gray-600'
    const labels = {
      on_track: 'On Track',
      at_risk: 'At Risk',
      needs_attention: 'Needs Attention'
    }
    return (
      <span className={`text-xs font-medium ${colorClass}`}>
        {labels[group.healthStatus] || group.healthStatus}
      </span>
    )
  }

  return (
    <div 
      onClick={() => navigate(`/groups/${group._id}`)}
      className="card cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <FolderKanban className="text-primary-600" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{group.name}</h3>
            <p className="text-sm text-gray-500">{group.projectCount || 0} projects</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getHealthBadge()}
          {canEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onEdit?.(group)
              }}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              title="Edit group"
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {group.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
          {group.description}
        </p>
      )}

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-gray-600">Goals Progress</span>
          <span className="font-medium text-gray-900">{progress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary-600 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <Users size={14} className="text-gray-400" />
          <span className="text-sm text-gray-600">Access</span>
        </div>
        {accessInitials.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {accessUsers.map((user) => (
              <span
                key={user._id}
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs text-white ${getAvatarColor(user.name)}`}
                title={user.name}
              >
                {getInitials(user.name)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-gray-500">No access assigned</span>
        )}
        {group.isRestricted && (
          <Lock size={14} className="text-gray-400" />
        )}
      </div>
    </div>
  )
}
