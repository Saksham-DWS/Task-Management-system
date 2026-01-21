import { useEffect, useMemo, useState } from 'react'
import {
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Calendar,
  Rocket,
  PartyPopper,
  Flag,
  Trash2,
  MessageSquare,
  TrendingUp,
  Download,
  Eye
} from 'lucide-react'
import { format } from 'date-fns'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts'
import AccessMultiSelect from '../../components/Inputs/AccessMultiSelect'
import FilterMultiSelect from '../../components/Inputs/FilterMultiSelect'
import { goalService } from '../../services/goal.service'
import { projectService } from '../../services/project.service'
import api from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { useAccess } from '../../hooks/useAccess'
import {
  formatDate,
  formatDateTime,
  getTodayInputDate,
  getInitials,
  getAvatarColor
} from '../../utils/helpers'
import {
  GOAL_STATUS,
  GOAL_STATUS_LABELS,
  GOAL_STATUS_COLORS,
  PRIORITY,
  PRIORITY_LABELS,
  PRIORITY_COLORS
} from '../../utils/constants'

const TAB_OPTIONS = [
  { id: 'my', label: 'My Goals' },
  { id: 'assigned', label: 'Assigned by Me' },
  { id: 'project', label: 'Project level' }
]

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: GOAL_STATUS.ACHIEVED, label: 'Achieved' },
  { id: GOAL_STATUS.PENDING, label: 'Pending' }
]

const buildMonthRange = (startDate, count = 12) => {
  const options = []
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1))
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const value = `${year}-${month}`
    options.push({ value, label: format(date, 'MMM yyyy') })
  }
  return options
}

const formatMonthLabel = (value) => {
  if (!value) return ''
  const [year, month] = value.split('-')
  if (!year || !month) return value
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
  return format(date, 'MMM yyyy')
}

const normalizeMonthValue = (value) => {
  if (!value) return ''
  return value.slice(0, 7)
}

const getGoalMonthValue = (goal) => {
  if (!goal) return ''
  return normalizeMonthValue(goal.targetMonth || goal.targetDate || '')
}

const toTimestamp = (value) => {
  if (!value) return 0
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

const normalizeTargetDateInput = (value) => {
  if (!value) return ''
  const trimmed = value.trim()
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('-')
    return `${year}-${month}-${day}`
  }
  return trimmed
}

const deriveTargetMonth = (value) => {
  if (!value) return ''
  const normalized = normalizeTargetDateInput(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized.slice(0, 7)
  }
  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return normalized
  }
  return ''
}

const DESCRIPTION_PREVIEW_LENGTH = 90
const normalizeAssignerLabel = (value) => {
  if (!value) return value
  return value.replace(/Manager comment/gi, 'Assigner comment')
}

const buildGoalTimelineEntries = (goal) => {
  if (!goal) return []
  const entries = []
  if (Array.isArray(goal.activity) && goal.activity.length > 0) {
    goal.activity.forEach((entry, idx) => {
      entries.push({
        id: `${goal.id}-activity-${entry.timestamp || idx}`,
        title: normalizeAssignerLabel(entry.description) || `Goal update: ${goal.title}`,
        timestamp: entry.timestamp,
        meta: entry.user ? `By ${entry.user}` : ''
      })
    })
  } else {
    if (goal.assignedAt) {
      entries.push({
        id: `${goal.id}-assigned`,
        title: `Goal assigned: ${goal.title}`,
        timestamp: goal.assignedAt,
        meta: goal.assignedByUser?.name ? `Assigned by ${goal.assignedByUser.name}` : ''
      })
    }
    if (goal.achievedAt) {
      entries.push({
        id: `${goal.id}-achieved`,
        title: `Goal achieved: ${goal.title}`,
        timestamp: goal.achievedAt,
        meta: goal.userComment ? `Comment: ${goal.userComment}` : ''
      })
    }
    if (goal.rejectedAt) {
      entries.push({
        id: `${goal.id}-rejected`,
        title: `Goal rejected: ${goal.title}`,
        timestamp: goal.rejectedAt,
        meta: goal.rejectionReason ? `Reason: ${goal.rejectionReason}` : ''
      })
    }
    if (goal.managerComment && !goal.achievedAt && !goal.rejectedAt) {
      entries.push({
        id: `${goal.id}-manager`,
        title: `Assigner comment: ${goal.title}`,
        timestamp: goal.assignedAt,
        meta: goal.managerComment
      })
    }
  }
  return entries.sort((a, b) => toTimestamp(a.timestamp) - toTimestamp(b.timestamp))
}

const getProjectGoalStatus = (goal) => {
  if (!goal) return GOAL_STATUS.PENDING
  if (goal.status) return goal.status
  if (goal.achieved_at || goal.achievedAt) return GOAL_STATUS.ACHIEVED
  return GOAL_STATUS.PENDING
}

export default function Goals() {
  const { user } = useAuthStore()
  const { isAdmin } = useAccess()
  const currentUserId = String(user?._id || user?.id || '')
  const canAssignAny = true
  const canManageAll = isAdmin()

  const [activeTab, setActiveTab] = useState('my')
  const [goalsMy, setGoalsMy] = useState([])
  const [goalsAssigned, setGoalsAssigned] = useState([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [selectedGoalId, setSelectedGoalId] = useState(null)
  const [assigning, setAssigning] = useState(false)
  const [actionState, setActionState] = useState(null)
  const [commentState, setCommentState] = useState(null)
  const [expandedDescriptions, setExpandedDescriptions] = useState({})
  const [projectGoalsProjects, setProjectGoalsProjects] = useState([])
  const [projectGoalsLoading, setProjectGoalsLoading] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState([])

  const assignMonthOptions = useMemo(() => buildMonthRange(new Date(), 12), [])

  const [assignForm, setAssignForm] = useState({
    assignedTo: '',
    title: '',
    description: '',
    targetDate: getTodayInputDate(),
    priority: PRIORITY.MEDIUM
  })

  useEffect(() => {
    const loadGoals = async () => {
      setLoading(true)
      try {
        const [myGoals, assignedGoals] = await Promise.all([
          goalService.getMyGoals(),
          goalService.getAssignedGoals()
        ])
        setGoalsMy(myGoals)
        setGoalsAssigned(assignedGoals)
      } catch (error) {
        console.error('Failed to load goals:', error)
      } finally {
        setLoading(false)
      }
    }

    const loadUsers = async () => {
      try {
        const response = await api.get('/users')
        setUsers(response.data || [])
      } catch (error) {
        console.error('Failed to load users:', error)
      }
    }

    loadGoals()
    loadUsers()
  }, [])

  useEffect(() => {
    if (activeTab !== 'project') return
    const loadProjects = async () => {
      setProjectGoalsLoading(true)
      try {
        const projects = await projectService.getAll()
        setProjectGoalsProjects(projects)
      } catch (error) {
        console.error('Failed to load project goals:', error)
      } finally {
        setProjectGoalsLoading(false)
      }
    }
    loadProjects()
  }, [activeTab])

  const assignableUsers = useMemo(() => {
    if (!currentUserId) return []
    if (canAssignAny) return users
    const found = users.find((item) => String(item._id || item.id) === currentUserId)
    if (found) return [found]
    return [{ _id: currentUserId, name: user?.name || 'Me', email: user?.email }]
  }, [canAssignAny, currentUserId, user?.email, user?.name, users])

  const goalsForTab = activeTab === 'my' ? goalsMy : activeTab === 'assigned' ? goalsAssigned : []

  const monthOptions = useMemo(() => {
    const values = new Set()
    assignMonthOptions.forEach((option) => values.add(option.value))
    goalsForTab.forEach((goal) => {
      const monthValue = getGoalMonthValue(goal)
      if (monthValue) values.add(monthValue)
    })
    return Array.from(values).sort().map((value) => ({
      value,
      label: formatMonthLabel(value)
    }))
  }, [assignMonthOptions, goalsForTab])

  const goalsForMonth = useMemo(() => {
    if (monthFilter === 'all') return goalsForTab
    return goalsForTab.filter((goal) => getGoalMonthValue(goal) === monthFilter)
  }, [goalsForTab, monthFilter])

  const filteredGoals = useMemo(() => {
    if (statusFilter === 'all') return goalsForMonth
    return goalsForMonth.filter((goal) => goal.status === statusFilter)
  }, [goalsForMonth, statusFilter])
  const shouldScrollGoals = filteredGoals.length > 4
  const shouldScrollGoalsHistory = filteredGoals.length > 8

  useEffect(() => {
    setActionState(null)
    setCommentState(null)
    if (activeTab !== 'assigned') {
      setSelectedGoalId(null)
    }
  }, [activeTab])

  useEffect(() => {
    if (!selectedGoalId) return
    const exists = goalsAssigned.some((goal) => goal.id === selectedGoalId)
    if (!exists) {
      setSelectedGoalId(null)
    }
  }, [goalsAssigned, selectedGoalId])

  const selectedGoal = goalsAssigned.find((goal) => goal.id === selectedGoalId) || null

  const achievedCount = filteredGoals.filter((goal) => goal.status === GOAL_STATUS.ACHIEVED).length
  const pendingCount = filteredGoals.filter((goal) => goal.status === GOAL_STATUS.PENDING).length
  const totalCount = filteredGoals.length
  const completionRate = achievedCount + pendingCount > 0
    ? Math.round((achievedCount / (achievedCount + pendingCount)) * 100)
    : 0

  const activeMonthLabel = monthFilter === 'all' ? 'All months' : formatMonthLabel(monthFilter)
  const effectiveMonthValue = useMemo(() => {
    if (monthFilter !== 'all') return monthFilter
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [monthFilter])
  const prevMonthValue = useMemo(() => {
    if (!effectiveMonthValue) return ''
    const [year, month] = effectiveMonthValue.split('-').map(Number)
    if (!year || !month) return ''
    const prev = new Date(Date.UTC(year, month - 2, 1))
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
  }, [effectiveMonthValue])

  const monthStatusCounts = useMemo(() => {
    const init = { achieved: 0, pending: 0 }
    if (!effectiveMonthValue) return init
    return goalsForTab.reduce((acc, goal) => {
      const goalMonth = getGoalMonthValue(goal)
      if (goalMonth !== effectiveMonthValue) return acc
      if (goal.status === GOAL_STATUS.ACHIEVED) acc.achieved += 1
      if (goal.status === GOAL_STATUS.PENDING) acc.pending += 1
      return acc
    }, { achieved: 0, pending: 0 })
  }, [effectiveMonthValue, goalsForTab])

  const prevMonthAchieved = useMemo(() => {
    if (!prevMonthValue) return 0
    return goalsForTab.reduce((acc, goal) => {
      if (getGoalMonthValue(goal) === prevMonthValue && goal.status === GOAL_STATUS.ACHIEVED) {
        return acc + 1
      }
      return acc
    }, 0)
  }, [goalsForTab, prevMonthValue])

  const achievedDelta = monthStatusCounts.achieved - prevMonthAchieved
  const achievedDeltaPercent = prevMonthAchieved > 0
    ? Math.round((achievedDelta / prevMonthAchieved) * 100)
    : monthStatusCounts.achieved > 0
      ? 100
      : 0
  const achievedDeltaLabel = prevMonthAchieved === 0 && monthStatusCounts.achieved === 0
    ? 'No change from last month'
    : `${achievedDelta >= 0 ? '+' : ''}${achievedDeltaPercent}% from last month`
  const monthCompletionRate = monthStatusCounts.achieved + monthStatusCounts.pending > 0
    ? Math.round(
      (monthStatusCounts.achieved / (monthStatusCounts.achieved + monthStatusCounts.pending)) * 100
    )
    : 0
  const pendingDueLabel = monthFilter === 'all'
    ? 'Due this month'
    : `Due in ${formatMonthLabel(monthFilter)}`

  const chartYear = useMemo(() => {
    if (monthFilter !== 'all') {
      return Number(monthFilter.split('-')[0])
    }
    return new Date().getFullYear()
  }, [monthFilter])

  const chartData = useMemo(() => {
    const months = Array.from({ length: 12 }).map((_, idx) => {
      const date = new Date(Date.UTC(chartYear, idx, 1))
      const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      return {
        value,
        label: format(date, 'MMM'),
        achieved: 0,
        pending: 0
      }
    })
    filteredGoals.forEach((goal) => {
      const monthValue = getGoalMonthValue(goal)
      const monthIndex = months.findIndex((item) => item.value === monthValue)
      if (monthIndex < 0) return
      if (goal.status === GOAL_STATUS.ACHIEVED) {
        months[monthIndex].achieved += 1
      } else if (goal.status === GOAL_STATUS.PENDING) {
        months[monthIndex].pending += 1
      }
    })
    return months
  }, [chartYear, filteredGoals])

  const goalTimelines = useMemo(() => {
    return filteredGoals.map((goal) => ({
      goal,
      entries: buildGoalTimelineEntries(goal)
    }))
  }, [filteredGoals])
  const shouldScrollGoalTimelines = goalTimelines.length > 4

  const projectOptions = useMemo(() => {
    return projectGoalsProjects
      .map((project) => {
        const projectId = String(project?._id || project?.id || '')
        if (!projectId) return null
        return {
          id: projectId,
          label: project?.name || 'Untitled project'
        }
      })
      .filter(Boolean)
  }, [projectGoalsProjects])

  const projectGoalCards = useMemo(() => {
    if (selectedProjectIds.length === 0) return []
    const selectedSet = new Set(selectedProjectIds)
    const cards = []
    projectGoalsProjects.forEach((project) => {
      const projectId = String(project?._id || project?.id || '')
      if (!projectId || !selectedSet.has(projectId)) return
      const goals = project.weeklyGoals || project.weekly_goals || []
      goals.forEach((goal) => {
        cards.push({
          ...goal,
          projectId,
          projectName: project?.name || 'Project'
        })
      })
    })
    return cards
  }, [projectGoalsProjects, selectedProjectIds])

  const filteredProjectGoals = useMemo(() => {
    if (statusFilter === 'all') return projectGoalCards
    return projectGoalCards.filter((goal) => getProjectGoalStatus(goal) === statusFilter)
  }, [projectGoalCards, statusFilter])

  const sortedProjectGoals = useMemo(() => {
    return [...filteredProjectGoals].sort((a, b) => {
      const aTimestamp = toTimestamp(a.created_at || a.createdAt)
      const bTimestamp = toTimestamp(b.created_at || b.createdAt)
      return bTimestamp - aTimestamp
    })
  }, [filteredProjectGoals])

  const updateGoalLists = (updatedGoal) => {
    setGoalsMy((prev) => prev.map((goal) => (goal.id === updatedGoal.id ? updatedGoal : goal)))
    setGoalsAssigned((prev) => prev.map((goal) => (goal.id === updatedGoal.id ? updatedGoal : goal)))
  }

  const handleAssignGoal = async (event) => {
    event.preventDefault()
    if (!assignForm.assignedTo || !assignForm.title || !assignForm.targetDate || !assignForm.priority) {
      alert('Assigned to, goal title, target date, and priority are required.')
      return
    }
    const normalizedTargetDate = normalizeTargetDateInput(assignForm.targetDate)
    const targetMonth = deriveTargetMonth(normalizedTargetDate)
    if (!normalizedTargetDate && !targetMonth) {
      alert('Please provide a valid target date.')
      return
    }
    setAssigning(true)
    try {
      const payload = {
        assigned_to: assignForm.assignedTo,
        title: assignForm.title.trim(),
        description: assignForm.description.trim() || null,
        target_date: normalizedTargetDate || undefined,
        target_month: targetMonth || undefined,
        priority: assignForm.priority
      }
      const created = await goalService.create(payload)
      setGoalsAssigned((prev) => [created, ...prev])
      if (String(created.assignedTo) === currentUserId) {
        setGoalsMy((prev) => [created, ...prev])
      }
      setAssignForm((prev) => ({
        ...prev,
        title: '',
        description: ''
      }))
    } catch (error) {
      console.error('Failed to assign goal:', error)
      const detail = error.response?.data?.detail
      if (!error.response) {
        alert('Unable to reach the server. Make sure the backend is running on http://localhost:8000.')
        return
      }
      if (Array.isArray(detail)) {
        const message = detail.map((item) => item?.msg).filter(Boolean).join(' ')
        alert(message || 'Failed to assign goal')
      } else if (typeof detail === 'string') {
        alert(detail)
      } else {
        alert('Failed to assign goal')
      }
    } finally {
      setAssigning(false)
    }
  }

  const handleStartAction = (goalId, type) => {
    setActionState({ id: goalId, type, comment: '' })
  }

  const handleCancelAction = () => {
    setActionState(null)
  }

  const handleSubmitAction = async () => {
    if (!actionState) return
    try {
      const updated = await goalService.updateStatus(
        actionState.id,
        GOAL_STATUS.ACHIEVED,
        actionState.comment.trim() || undefined
      )
      updateGoalLists(updated)
      setActionState(null)
    } catch (error) {
      console.error('Failed to update goal status:', error)
      alert(error.response?.data?.detail || 'Failed to update goal status')
    }
  }

  const handleStartComment = (goalId, type) => {
    setCommentState({ id: goalId, type, comment: '' })
  }

  const handleCancelComment = () => {
    setCommentState(null)
  }

  const toggleDescription = (goalId) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [goalId]: !prev[goalId]
    }))
  }

  const handleSubmitComment = async () => {
    if (!commentState) return
    if (!commentState.comment.trim()) {
      alert('Please enter a comment.')
      return
    }
    try {
      const updated = await goalService.addComment(
        commentState.id,
        commentState.comment.trim(),
        commentState.type
      )
      updateGoalLists(updated)
      setCommentState(null)
    } catch (error) {
      console.error('Failed to add comment:', error)
      alert(error.response?.data?.detail || 'Failed to add comment')
    }
  }

  const handleDeleteGoal = async (goalId) => {
    const confirmDelete = window.confirm('Delete this goal? This cannot be undone.')
    if (!confirmDelete) return
    try {
      await goalService.delete(goalId)
      setGoalsAssigned((prev) => prev.filter((goal) => goal.id !== goalId))
      setGoalsMy((prev) => prev.filter((goal) => goal.id !== goalId))
      setSelectedGoalId(null)
    } catch (error) {
      console.error('Failed to delete goal:', error)
      alert(error.response?.data?.detail || 'Failed to delete goal')
    }
  }

  const handleExport = () => {
    if (filteredGoals.length === 0) {
      alert('No goals to export.')
      return
    }
    const headers = ['Goal', 'Assigned To', 'Month', 'Priority', 'Status']
    const rows = filteredGoals.map((goal) => {
      const assignedToName = goal.assignedToUser?.name || 'User'
      const monthLabel = formatMonthLabel(getGoalMonthValue(goal))
      return [
        goal.title,
        assignedToName,
        monthLabel,
        PRIORITY_LABELS[goal.priority] || goal.priority,
        GOAL_STATUS_LABELS[goal.status] || goal.status
      ]
    })
    const escapeCsv = (value) => `"${String(value || '').replace(/"/g, '""')}"`
    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `goals-${activeTab}-${monthFilter === 'all' ? 'all' : monthFilter}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Goals & Achievements</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Track, assign, and measure goal completion across your team.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {TAB_OPTIONS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'assigned' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-[320px,1fr] gap-6 items-start">
            <div className="card w-full md:justify-self-start">
              <div className="flex items-center gap-2 mb-4">
                <Target className="text-blue-600" size={18} />
                <h3 className="font-semibold text-gray-900 dark:text-white">Assign a Goal</h3>
              </div>
              <form onSubmit={handleAssignGoal} className="space-y-4">
                <AccessMultiSelect
                  users={assignableUsers}
                  selectedIds={assignForm.assignedTo ? [assignForm.assignedTo] : []}
                  onChange={(ids) => setAssignForm((prev) => ({ ...prev, assignedTo: ids[0] || '' }))}
                  label="Assigned To"
                  maxSelections={1}
                  placeholder="Search users..."
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal Title</label>
                  <input
                    type="text"
                    value={assignForm.title}
                    onChange={(e) => setAssignForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="input-field"
                    placeholder="e.g. Improve deployment speed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea
                    value={assignForm.description}
                    onChange={(e) => setAssignForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="input-field min-h-[110px]"
                    placeholder="Optional details..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Date</label>
                  <input
                    type="date"
                    value={assignForm.targetDate}
                    onChange={(e) => setAssignForm((prev) => ({ ...prev, targetDate: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                  <select
                    value={assignForm.priority}
                    onChange={(e) => setAssignForm((prev) => ({ ...prev, priority: e.target.value }))}
                    className="input-field"
                  >
                    <option value={PRIORITY.HIGH}>High</option>
                    <option value={PRIORITY.MEDIUM}>Medium</option>
                    <option value={PRIORITY.LOW}>Low</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary w-full" disabled={assigning}>
                  {assigning ? 'Assigning...' : 'Assign Goal'}
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card text-left">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{monthStatusCounts.achieved}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Achieved Goals</p>
                    <p className="text-xs text-emerald-600 mt-1">{achievedDeltaLabel}</p>
                  </div>
                  <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="text-emerald-600" size={18} />
                  </div>
                </div>
              </div>
              <div className="card text-left">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{monthStatusCounts.pending}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Pending Goals</p>
                    <p className="text-xs text-amber-600 mt-1">{pendingDueLabel}</p>
                  </div>
                  <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                    <Clock className="text-amber-600" size={18} />
                  </div>
                </div>
              </div>
              <div className="card text-left">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{monthCompletionRate}%</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Completion Rate</p>
                    <div className="progress-bar mt-3">
                      <div
                        className="progress-fill bg-blue-600"
                        style={{ width: `${monthCompletionRate}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <TrendingUp className="text-blue-600" size={18} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
                {STATUS_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setStatusFilter(item.id)}
                    className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                      statusFilter === item.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 md:ml-auto flex-nowrap">
                <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Month:</span>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="input-field py-1.5 text-sm min-w-[160px]"
                >
                  <option value="all">All</option>
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary text-sm px-3 py-2 whitespace-nowrap" onClick={handleExport} type="button">
                  <Download size={16} />
                  Export
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Goals History</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {filteredGoals.length} records
              </span>
            </div>
            {filteredGoals.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No goals assigned yet.</p>
            ) : (
              <div
                className={
                  shouldScrollGoalsHistory
                    ? 'max-h-[520px] overflow-auto pr-2'
                    : 'overflow-x-auto'
                }
              >
                <table className="w-full min-w-[1200px]">
                  <thead className="sticky top-0 z-10 bg-white dark:bg-[#111111]">
                    <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <th className="py-3 pr-4">Goal</th>
                      <th className="py-3 pr-4">Assigned To</th>
                      <th className="py-3 pr-4">Month</th>
                      <th className="py-3 pr-4">Priority</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">User Comment</th>
                      <th className="py-3 pr-4">Assigner Comment</th>
                      <th className="py-3 pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGoals.map((goal) => {
                      const priorityClass = PRIORITY_COLORS[goal.priority] || 'bg-gray-100 text-gray-600'
                      const statusClass = GOAL_STATUS_COLORS[goal.status] || 'bg-gray-100 text-gray-600'
                      const assignedToName = goal.assignedToUser?.name || 'User'
                      const assignedToEmail = goal.assignedToUser?.email
                      const isSelected = selectedGoalId === goal.id
                      return (
                        <tr
                          key={goal.id}
                          className={`border-b border-gray-100 dark:border-gray-800 ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                        >
                          <td className="py-3 pr-4">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{goal.title}</p>
                              {goal.description && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {goal.description}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <div className={`avatar-sm ${getAvatarColor(assignedToName)}`}>
                                {getInitials(assignedToName)}
                              </div>
                              <div>
                                <p className="text-sm text-gray-900 dark:text-white">{assignedToName}</p>
                                {assignedToEmail && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{assignedToEmail}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-sm text-gray-600 dark:text-gray-400">
                            {formatMonthLabel(getGoalMonthValue(goal))}
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 text-xs rounded-full ${priorityClass}`}>
                              {PRIORITY_LABELS[goal.priority] || goal.priority}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 text-xs rounded-full ${statusClass}`}>
                              {GOAL_STATUS_LABELS[goal.status] || goal.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-gray-600 dark:text-gray-400">
                            <span
                              className="block max-w-[220px] truncate"
                              title={goal.userComment || ''}
                            >
                              {goal.userComment || '-'}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-gray-600 dark:text-gray-400">
                            <span
                              className="block max-w-[220px] truncate"
                              title={goal.managerComment || ''}
                            >
                              {goal.managerComment || '-'}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <button
                              onClick={() => setSelectedGoalId((prev) => (prev === goal.id ? null : goal.id))}
                              className="text-blue-600 hover:text-blue-700"
                              title="View details"
                              type="button"
                            >
                              <Eye size={18} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedGoal && (
            <div className="card">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Goal Details</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedGoal.title}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${GOAL_STATUS_COLORS[selectedGoal.status] || 'bg-gray-100 text-gray-600'}`}>
                    {GOAL_STATUS_LABELS[selectedGoal.status] || selectedGoal.status}
                  </span>
                  {(canManageAll || String(selectedGoal.assignedBy) === currentUserId) && (
                    <button
                      onClick={() => handleDeleteGoal(selectedGoal.id)}
                      className="text-red-600 hover:text-red-700"
                      title="Delete goal"
                      type="button"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400">
                <div>Assigned to: {selectedGoal.assignedToUser?.name || 'User'}</div>
                <div>Target: {formatMonthLabel(getGoalMonthValue(selectedGoal))}</div>
                <div>Assigned on: {formatDate(selectedGoal.assignedAt)}</div>
                {selectedGoal.achievedAt && (
                  <div>Achieved on: {formatDate(selectedGoal.achievedAt)}</div>
                )}
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                {selectedGoal.userComment && (
                  <div className="rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-2">
                    User comment: {selectedGoal.userComment}
                  </div>
                )}
                {selectedGoal.managerComment && (
                  <div className="rounded-lg bg-blue-50 text-blue-700 border border-blue-100 px-3 py-2">
                    Assigner comment: {selectedGoal.managerComment}
                  </div>
                )}
              </div>
              {(String(selectedGoal.assignedBy) === currentUserId || canManageAll) && !selectedGoal.managerComment && (
                <div className="mt-4">
                  <button
                    onClick={() => handleStartComment(selectedGoal.id, 'manager')}
                    className="text-blue-600 text-sm font-medium"
                    type="button"
                  >
                    Add Assigner Comment
                  </button>
                </div>
              )}
              {commentState?.id === selectedGoal.id && commentState?.type === 'manager' && (
                <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                  <textarea
                    value={commentState.comment}
                    onChange={(e) => setCommentState((prev) => ({ ...prev, comment: e.target.value }))}
                    className="input-field min-h-[100px]"
                    placeholder="Share your comment..."
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSubmitComment} className="btn-primary" type="button">
                      Save Comment
                    </button>
                    <button onClick={handleCancelComment} className="btn-secondary" type="button">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Monthly Goals Progress - {chartYear}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Achieved vs pending goals by month
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Achieved
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span> Pending
                </span>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <div className="min-w-[560px] h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    barSize={32}
                    barCategoryGap="22%"
                    margin={{ top: 12, right: 12, left: 0, bottom: 6 }}
                  >
                    <CartesianGrid vertical={false} stroke="#eef2f7" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      width={24}
                      domain={[0, 'dataMax + 1']}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                      contentStyle={{ borderRadius: '8px', borderColor: '#e5e7eb', fontSize: '12px' }}
                      labelStyle={{ fontWeight: 600 }}
                      formatter={(value, name) => [value, name === 'achieved' ? 'Achieved' : 'Pending']}
                    />
                    <Bar
                      dataKey="achieved"
                      stackId="goals"
                      fill="#10b981"
                      radius={[0, 0, 8, 8]}
                    />
                    <Bar
                      dataKey="pending"
                      stackId="goals"
                      fill="#f59e0b"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'project' && (
        <>
          <div className="card space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Target className="text-blue-600" size={18} />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Project level Goals & Achievements
                </h3>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {sortedProjectGoals.length} goals
              </span>
            </div>
            <FilterMultiSelect
              label="Select Project to view goals"
              items={projectOptions}
              selectedIds={selectedProjectIds}
              onChange={setSelectedProjectIds}
              placeholder="Select projects..."
              searchPlaceholder="Search projects..."
              emptyLabel="No projects available"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setStatusFilter(item.id)}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    statusFilter === item.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {projectGoalsLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {projectOptions.length === 0 && (
                <div className="card text-center text-gray-500 dark:text-gray-400 lg:col-span-2">
                  No projects available for your access.
                </div>
              )}
              {projectOptions.length > 0 && selectedProjectIds.length === 0 && (
                <div className="card text-center text-gray-500 dark:text-gray-400 lg:col-span-2">
                  Select a project to view project-level goals.
                </div>
              )}
              {selectedProjectIds.length > 0 && sortedProjectGoals.length === 0 && (
                <div className="card text-center text-gray-500 dark:text-gray-400 lg:col-span-2">
                  No goals found for the selected projects.
                </div>
              )}
              {sortedProjectGoals.map((goal) => {
                const status = getProjectGoalStatus(goal)
                const isAchieved = status === GOAL_STATUS.ACHIEVED
                const statusClass = GOAL_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'
                const statusLabel = GOAL_STATUS_LABELS[status] || status
                const createdAtLabel = formatDateTime(goal.created_at || goal.createdAt) || 'Unknown date'
                const createdBy = goal.created_by_name || goal.createdByName || 'Unknown'
                const achievedBy = goal.achieved_by_name || goal.achievedByName || 'Unknown'
                const achievedAtLabel = formatDateTime(goal.achieved_at || goal.achievedAt)
                const goalText = goal.text || goal.goal || 'Project goal'
                const goalKey = goal.id !== undefined && goal.id !== null
                  ? `${goal.projectId}-${goal.id}`
                  : `${goal.projectId}-${goal.created_at || goal.createdAt || goalText}`
                return (
                  <div key={goalKey} className="card h-full flex flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Project:{' '}
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {goal.projectName || 'Project'}
                        </span>
                      </p>
                      <span className={`px-2 py-1 text-xs rounded-full ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="mt-3 flex items-start gap-2">
                      <Flag size={16} className="text-blue-600 mt-0.5" />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">
                        {goalText}
                      </p>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-gray-400" />
                        <span>
                          Added by:{' '}
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            {createdBy}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span>
                          Added on:{' '}
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            {createdAtLabel}
                          </span>
                        </span>
                      </div>
                      {isAchieved && (
                        <div className="flex items-center gap-2 text-emerald-600">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          <span>
                            Achieved by:{' '}
                            <span className="font-medium">
                              {achievedBy}
                            </span>
                            {achievedAtLabel ? ` on ${achievedAtLabel}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'my' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card text-left">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCount}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Goals</p>
                  <p className="text-xs text-gray-500 mt-1">{activeMonthLabel}</p>
                </div>
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Target className="text-blue-600" size={18} />
                </div>
              </div>
            </div>
            <div className="card text-left">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{achievedCount}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Achieved</p>
                  <p className="text-xs text-emerald-600 mt-1">{activeMonthLabel}</p>
                </div>
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="text-emerald-600" size={18} />
                </div>
              </div>
            </div>
            <div className="card text-left">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingCount}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Pending</p>
                  <p className="text-xs text-amber-600 mt-1">{activeMonthLabel}</p>
                </div>
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                  <Clock className="text-amber-600" size={18} />
                </div>
              </div>
            </div>
            <div className="card text-left">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{completionRate}%</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Completion Rate</p>
                  <div className="progress-bar mt-3">
                    <div
                      className="progress-fill bg-blue-600"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </div>
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <TrendingUp className="text-purple-600" size={18} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
                {STATUS_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setStatusFilter(item.id)}
                    className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                      statusFilter === item.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Month:</span>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="input-field py-1.5 text-sm"
                >
                  <option value="all">All</option>
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div
            className={
              shouldScrollGoals
                ? 'max-h-[calc(4*320px+72px)] md:max-h-[calc(2*360px+24px)] overflow-y-auto pr-2'
                : ''
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredGoals.length === 0 && (
                <div className="card text-center text-gray-500 dark:text-gray-400 lg:col-span-2">
                  No goals match your filters.
                </div>
              )}
              {filteredGoals.map((goal) => {
                const assignedByName = goal.assignedByUser?.name || 'Unknown'
                const isPending = goal.status === GOAL_STATUS.PENDING
                const isAchieved = goal.status === GOAL_STATUS.ACHIEVED
                const isRejected = goal.status === GOAL_STATUS.REJECTED
                const isActionOpen = actionState?.id === goal.id
                const isCommentOpen = commentState?.id === goal.id && commentState?.type === 'user'
                const targetLabel = formatMonthLabel(getGoalMonthValue(goal))
                const targetDateLabel = formatDate(goal.targetDate)
                const targetDisplay = targetDateLabel || targetLabel || 'No target'
                const priorityLabel = `${PRIORITY_LABELS[goal.priority] || goal.priority} Priority`
                const statusLabel = GOAL_STATUS_LABELS[goal.status] || goal.status
                const priorityBadgeClass = `badge priority-${goal.priority || 'low'}`
                const statusBadgeClass = isAchieved
                  ? 'badge-success'
                  : isPending
                    ? 'badge-warning'
                    : isRejected
                      ? 'badge-danger'
                      : 'badge-neutral'
                const statusDotClass = isRejected
                  ? 'bg-red-500'
                  : isPending
                    ? 'bg-amber-500'
                    : 'bg-gray-400'
                const descriptionText = (goal.description || '').trim()
                const isDescriptionExpanded = Boolean(expandedDescriptions[goal.id])
                const shouldTruncateDescription = descriptionText.length > DESCRIPTION_PREVIEW_LENGTH
                const visibleDescription = shouldTruncateDescription && !isDescriptionExpanded
                  ? descriptionText.slice(0, DESCRIPTION_PREVIEW_LENGTH).trim()
                  : descriptionText
                const datePrefix = isAchieved ? 'Achieved on:' : isRejected ? 'Rejected on:' : 'Assigned:'
                const dateValue = isAchieved
                  ? goal.achievedAt
                  : isRejected
                    ? goal.rejectedAt || goal.assignedAt
                    : goal.assignedAt
                const dateLabel = formatDate(dateValue)
                const titleIcon = isAchieved ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                    <CheckCircle2 size={16} />
                  </span>
                ) : isRejected ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-100 text-red-600">
                    <AlertTriangle size={16} />
                  </span>
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                    <Rocket size={16} />
                  </span>
                )

                return (
                  <div key={goal.id} className="card h-full flex flex-col">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={priorityBadgeClass}>
                          {priorityLabel}
                        </span>
                        <span className={`inline-flex items-center gap-1 ${statusBadgeClass}`}>
                          {isAchieved ? (
                            <CheckCircle2 size={12} className="text-emerald-600" />
                          ) : (
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`}></span>
                          )}
                          {statusLabel}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        {titleIcon}
                        <div>
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{goal.title}</h3>
                          {descriptionText && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed break-words">
                              {visibleDescription}
                              {shouldTruncateDescription && !isDescriptionExpanded && (
                                <button
                                  type="button"
                                  onClick={() => toggleDescription(goal.id)}
                                  className="ml-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                                >
                                  ....more
                                </button>
                              )}
                              {shouldTruncateDescription && isDescriptionExpanded && (
                                <button
                                  type="button"
                                  onClick={() => toggleDescription(goal.id)}
                                  className="ml-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                                >
                                  show less
                                </button>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-gray-400" />
                          <span>
                            Assigned by:{' '}
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                              {assignedByName}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Flag size={14} className="text-gray-400" />
                          <span>
                            Target:{' '}
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                              {targetDisplay}
                            </span>
                          </span>
                        </div>
                        <div className={`flex items-center gap-2 ${isAchieved ? 'text-emerald-600' : ''}`}>
                          {isAchieved ? (
                            <CheckCircle2 size={14} className="text-emerald-500" />
                          ) : (
                            <Calendar size={14} className="text-gray-400" />
                          )}
                          <span>
                            {datePrefix}{' '}
                            <span className={`font-medium ${isAchieved ? 'text-emerald-600' : 'text-gray-700 dark:text-gray-200'}`}>
                              {dateLabel}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {isPending && (
                      <div className="mt-auto pt-4">
                        <button
                          onClick={() => handleStartAction(goal.id, 'achieve')}
                          className="btn-success w-full inline-flex items-center justify-center gap-2 text-sm"
                          type="button"
                        >
                          <CheckCircle2 size={14} />
                          Mark as Achieved
                        </button>
                      </div>
                    )}

                    {isActionOpen && (
                      <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                        <textarea
                          value={actionState.comment}
                          onChange={(e) => setActionState((prev) => ({ ...prev, comment: e.target.value }))}
                          className="input-field min-h-[100px]"
                          placeholder="Add a completion comment (optional)"
                        />
                        <div className="flex gap-2">
                          <button onClick={handleSubmitAction} className="btn-primary" type="button">
                            Confirm
                          </button>
                          <button onClick={handleCancelAction} className="btn-secondary" type="button">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {isAchieved && (
                      <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
                        {goal.managerComment && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-700 flex items-start gap-2">
                            <PartyPopper size={16} className="mt-0.5 text-emerald-500" />
                            <span>{goal.managerComment}</span>
                          </div>
                        )}
                        {goal.userComment && (
                          <div className="rounded-lg bg-blue-50 text-blue-700 border border-blue-100 px-3 py-2 flex items-start gap-2">
                            <MessageSquare size={14} className="mt-0.5" />
                            <span>{goal.userComment}</span>
                          </div>
                        )}
                        {!goal.userComment && (
                          <button
                            onClick={() => handleStartComment(goal.id, 'user')}
                            className="text-blue-600 text-sm font-medium"
                            type="button"
                          >
                            Add Comment
                          </button>
                        )}
                      </div>
                    )}

                    {isRejected && (
                      <div className="mt-4 text-sm text-red-600 rounded-lg bg-red-50 border border-red-100 px-3 py-2 flex items-start gap-2">
                        <AlertTriangle size={14} className="mt-0.5" />
                        <span>Reason: {goal.rejectionReason || 'No reason shared'}</span>
                      </div>
                    )}

                    {isCommentOpen && (
                      <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                        <textarea
                          value={commentState.comment}
                          onChange={(e) => setCommentState((prev) => ({ ...prev, comment: e.target.value }))}
                          className="input-field min-h-[100px]"
                          placeholder="Share your completion note..."
                        />
                        <div className="flex gap-2">
                          <button onClick={handleSubmitComment} className="btn-primary" type="button">
                            Save Comment
                          </button>
                          <button onClick={handleCancelComment} className="btn-secondary" type="button">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Monthly Timeline - {activeMonthLabel}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Scroll each goal to review the full progress timeline.
                </p>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {goalTimelines.length} goals
              </span>
            </div>
            {goalTimelines.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No activity recorded yet.</p>
            ) : (
              <div
                className={
                  shouldScrollGoalTimelines
                    ? 'max-h-[640px] overflow-y-auto pr-2 space-y-4'
                    : 'space-y-4'
                }
              >
                {goalTimelines.map(({ goal, entries }) => {
                  const statusClass = GOAL_STATUS_COLORS[goal.status] || 'bg-gray-100 text-gray-600'
                  const statusLabel = GOAL_STATUS_LABELS[goal.status] || goal.status
                  return (
                    <div
                      key={goal.id}
                      className="rounded-lg border border-gray-100 dark:border-gray-800 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {goal.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Target: {formatMonthLabel(getGoalMonthValue(goal))}
                          </p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                      {entries.length === 0 ? (
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                          No activity recorded yet.
                        </p>
                      ) : (
                        <div className="mt-4 overflow-x-auto">
                          <div className="relative flex items-start gap-6 min-w-max pt-2 pb-3">
                            <div className="absolute left-0 right-0 top-3 h-px bg-gray-200 dark:bg-gray-700"></div>
                            {entries.map((entry) => (
                              <div key={entry.id} className="relative z-10 flex-shrink-0 w-64">
                                <div className="mt-2 w-3 h-3 rounded-full bg-blue-600 border-2 border-white dark:border-gray-900"></div>
                                <div className="mt-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-white/60 dark:bg-gray-900/40 p-3 shadow-sm">
                                  <p className="text-sm text-gray-900 dark:text-white">{entry.title}</p>
                                  {entry.meta && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {entry.meta}
                                    </p>
                                  )}
                                  {entry.timestamp && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {formatDateTime(entry.timestamp)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
