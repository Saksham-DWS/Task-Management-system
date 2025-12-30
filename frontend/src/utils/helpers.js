import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns'
import { TASK_STATUS, normalizeTaskStatus } from './constants'

const parseDateSafe = (date) => {
  if (!date) return null
  if (typeof date === 'string') {
    const trimmed = date.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, d))
    }
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)
    const parsed = new Date(hasTz ? trimmed : `${trimmed}Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? null : d
}

// Format date for display
export const formatDate = (date) => {
  const parsed = parseDateSafe(date)
  if (!parsed) return ''
  return format(parsed, 'MMM dd, yyyy')
}

// Format date with time
export const formatDateTime = (date) => {
  const parsed = parseDateSafe(date)
  if (!parsed) return ''
  return format(parsed, 'dd MMM yyyy h:mm a')
}

export const getTodayInputDate = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().split('T')[0]
}

// Get relative time
export const getRelativeTime = (date) => {
  const parsed = parseDateSafe(date)
  if (!parsed) return ''
  return formatDistanceToNow(parsed, { addSuffix: true })
}

// Check if date is overdue
export const isOverdue = (date) => {
  const parsed = parseDateSafe(date)
  if (!parsed) return false
  return isPast(parsed) && !isToday(parsed)
}

// Get due date label
export const getDueDateLabel = (date) => {
  if (!date) return ''
  const d = new Date(date)
  if (isToday(d)) return 'Due Today'
  if (isTomorrow(d)) return 'Due Tomorrow'
  if (isOverdue(date)) return 'Overdue'
  return formatDate(date)
}

// Generate avatar initials
export const getInitials = (name) => {
  if (!name) return '?'
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Generate avatar color based on name
export const getAvatarColor = (name) => {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-red-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500'
  ]
  if (!name) return colors[0]
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}

// Calculate progress percentage
export const calculateProgress = (completed, total) => {
  if (!total || total === 0) return 0
  return Math.round((completed / total) * 100)
}

// Truncate text
export const truncateText = (text, maxLength = 100) => {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// Generate unique ID
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Group tasks by status
export const groupTasksByStatus = (tasks) => {
  return {
    not_started: tasks.filter(t => normalizeTaskStatus(t.status) === TASK_STATUS.NOT_STARTED),
    in_progress: tasks.filter(t => normalizeTaskStatus(t.status) === TASK_STATUS.IN_PROGRESS),
    hold: tasks.filter(t => normalizeTaskStatus(t.status) === TASK_STATUS.HOLD),
    review: tasks.filter(t => normalizeTaskStatus(t.status) === TASK_STATUS.REVIEW),
    completed: tasks.filter(t => normalizeTaskStatus(t.status) === TASK_STATUS.COMPLETED)
  }
}

// Calculate health score
export const calculateHealthScore = (goals, achievements) => {
  if (!goals || goals.length === 0) return 100
  const completed = achievements?.length || 0
  return Math.round((completed / goals.length) * 100)
}

// Get health status based on score
export const getHealthStatus = (score) => {
  if (score >= 70) return 'on_track'
  if (score >= 40) return 'at_risk'
  return 'needs_attention'
}

// Re-export isToday from date-fns
export { isToday } from 'date-fns'
