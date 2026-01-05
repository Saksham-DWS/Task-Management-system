import { useNavigate } from 'react-router-dom'
import { MessageSquare, Calendar, AlertTriangle } from 'lucide-react'
import { getInitials, getAvatarColor, getDueDateLabel, isOverdue } from '../../utils/helpers'
import { PRIORITY_COLORS, PRIORITY_LABELS } from '../../utils/constants'

export default function TaskCard({ task, onClick }) {
  const navigate = useNavigate()
  
  const priorityClass = PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-700'
  const priorityLabel = PRIORITY_LABELS[task.priority] || task.priority
  const dueDateLabel = getDueDateLabel(task.dueDate)
  const overdue = isOverdue(task.dueDate)

  const handleClick = () => {
    if (onClick) {
      onClick(task)
    } else {
      navigate(`/tasks/${task._id}`)
    }
  }

  return (
    <div 
      onClick={handleClick}
      className="bg-white dark:bg-[#111111] p-4 rounded-lg border border-gray-200 dark:border-gray-800 cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-gray-900 dark:text-white line-clamp-2">{task.title}</h4>
        {task.aiRisk && (
          <AlertTriangle size={16} className="text-yellow-500 flex-shrink-0 ml-2" />
        )}
      </div>

      {/* Priority badge */}
      <div className="mb-3">
        <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${priorityClass}`}>
          {priorityLabel}
        </span>
      </div>

      {/* Description preview */}
      {task.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
        {/* Due date */}
        <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>
          <Calendar size={12} />
          <span>{dueDateLabel || 'No due date'}</span>
        </div>

        {/* Comments count */}
        {task.commentCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <MessageSquare size={12} />
            <span>{task.commentCount}</span>
          </div>
        )}
      </div>

      {/* Assignees */}
      {task.assignees?.length > 0 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex -space-x-2">
            {task.assignees.slice(0, 3).map((assignee, idx) => (
              <div 
                key={idx}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs border-2 border-white dark:border-gray-900 ${getAvatarColor(assignee.name)}`}
                title={assignee.name}
              >
                {getInitials(assignee.name)}
              </div>
            ))}
            {task.assignees.length > 3 && (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-200 border-2 border-white dark:border-gray-900">
                +{task.assignees.length - 3}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
