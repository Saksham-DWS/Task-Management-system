import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, Calendar, Settings } from 'lucide-react'
import { getInitials, getAvatarColor, formatDate } from '../../utils/helpers'
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, AI_HEALTH_COLORS } from '../../utils/constants'

export default function ProjectCard({ project, canEdit = false, onEdit }) {
  const navigate = useNavigate()
  
  const statusClass = PROJECT_STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-700'
  const statusLabel = PROJECT_STATUS_LABELS[project.status] || project.status
  const deadline = project.endDate || project.end_date || project.dueDate || project.due_date
  const memberMap = new Map()
  const orderedMembers = []
  const addMember = (member) => {
    if (!member) return
    const memberId = member._id || member.id || member.email || member.name
    if (memberMap.has(memberId)) return
    memberMap.set(memberId, member)
    orderedMembers.push(member)
  }
  addMember(project.owner)
  ;(project.accessUsers || project.access_users || []).forEach(addMember)
  ;(project.members || []).forEach(addMember)
  ;(project.collaborators || []).forEach(addMember)
  const members = orderedMembers
  const memberCount = members.length
  const accessUserIds = project.accessUserIds || project.access_user_ids || []

  const getHealthBadge = () => {
    if (!project.healthScore) return null
    let status = 'on_track'
    if (project.healthScore < 70) status = 'at_risk'
    if (project.healthScore < 40) status = 'needs_attention'
    const colorClass = AI_HEALTH_COLORS[status]
    return (
      <span className={`text-xs font-medium ${colorClass}`}>
        {project.healthScore}%
      </span>
    )
  }

  return (
    <div 
      onClick={() => navigate(`/projects/${project._id}`)}
      className="card cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Briefcase className="text-blue-600" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{project.name}</h3>
            <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getHealthBadge()}
          {canEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onEdit?.(project)
              }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
              title="Edit project"
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">
          {project.description}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300 mb-4">
        <div className="flex items-center gap-1">
          <Calendar size={14} />
          <span>{formatDate(deadline) || 'No deadline'}</span>
        </div>
        <div className="flex items-center gap-1">
          <Users size={14} />
          <span>{memberCount} members</span>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <Users size={14} className="text-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Members</span>
        </div>
        {memberCount > 0 ? (
          <div className="flex flex-wrap gap-2">
            {members.slice(0, 8).map((member) => (
              <span
                key={member._id || member.id || member.email || member.name}
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs text-white ${getAvatarColor(member.name)}`}
                title={member.name}
              >
                {getInitials(member.name)}
              </span>
            ))}
            {memberCount > 8 && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                +{memberCount - 8}
              </span>
            )}
            {memberCount === 0 && accessUserIds.length > 0 && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {accessUserIds.length} access user(s)
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">No members assigned</span>
        )}
      </div>
    </div>
  )
}
