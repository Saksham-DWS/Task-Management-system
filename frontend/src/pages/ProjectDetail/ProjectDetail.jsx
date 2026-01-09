import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext } from '@hello-pangea/dnd'
import { ArrowLeft, Settings, Target, BarChart3, Plus, CalendarDays, Send, Paperclip, Image } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAuthStore } from '../../store/auth.store'
import { useAccess } from '../../hooks/useAccess'
import { projectService } from '../../services/project.service'
import { taskService } from '../../services/task.service'
import { aiService } from '../../services/ai.service'
import api from '../../services/api'
import KanbanColumn from '../../components/Kanban/KanbanColumn'
import NewTaskModal from '../../components/Modals/NewTaskModal'
import EditProjectModal from '../../components/Modals/EditProjectModal'
import ActivityLogModal from '../../components/Modals/ActivityLogModal'
import ReasonModal from '../../components/Modals/ReasonModal'
import ProjectAIInsights from '../../components/AI/ProjectAIInsights'
import { groupTasksByStatus, calculateProgress, getInitials, getAvatarColor, formatDate, formatDateTime, getRelativeTime } from '../../utils/helpers'
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, TASK_STATUS, TASK_STATUS_LABELS, TASK_STATUS_ORDER, normalizeTaskStatus } from '../../utils/constants'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeModal, openModal, modalData } = useUIStore()
  const { user } = useAuthStore()
  const { canCreateInProject } = useAccess()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('board')
  const [goals, setGoals] = useState([])
  const [newGoal, setNewGoal] = useState('')
  const [goalStatusUpdating, setGoalStatusUpdating] = useState({})
  const [initialStatus, setInitialStatus] = useState(TASK_STATUS.NOT_STARTED)
  const [allUsers, setAllUsers] = useState([])
  const [activity, setActivity] = useState([])
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [replyDrafts, setReplyDrafts] = useState({})
  const [attachments, setAttachments] = useState([])
  const [aiInsight, setAiInsight] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [holdReasonModal, setHoldReasonModal] = useState(null)
  const [holdReasonText, setHoldReasonText] = useState('')
  const [holdReasonSaving, setHoldReasonSaving] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [projectData, tasksData, usersData, commentsData] = await Promise.all([
        projectService.getById(id),
        taskService.getByProject(id),
        api.get('/users').then(res => res.data).catch(() => []),
        projectService.getComments(id)
      ])
      setProject(projectData)
      setTasks(tasksData)
      setAllUsers(usersData)
      setGoals(projectData.weeklyGoals || projectData.weekly_goals || [])
      setActivity(projectData.activity || [])
      setComments(commentsData)
    } catch (error) {
      console.error('Failed to load project:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab !== 'insights' || !id) return
    const loadInsights = async () => {
      try {
        const aiData = await aiService.getProjectInsights(id).catch(() => null)
        setAiInsight(aiData?.insight || null)
      } catch (error) {
        console.error('Failed to load AI insights:', error)
      }
    }
    loadInsights()
  }, [activeTab, id])

  const pushActivityEntry = (description) => {
    if (!description) return
    const entry = {
      description,
      timestamp: new Date().toISOString(),
      user: user?.name || 'Unknown',
      user_id: user?._id || user?.id
    }
    setActivity((prev) => [entry, ...(prev || [])])
  }

  const refreshProjectActivity = async () => {
    try {
      const updated = await projectService.getById(id)
      setProject(updated)
      setGoals(updated.weeklyGoals || updated.weekly_goals || [])
      setActivity(updated.activity || [])
    } catch (error) {
      console.error('Failed to refresh project activity:', error)
    }
  }

  const handleGenerateAiInsights = async () => {
    setAiLoading(true)
    try {
      const data = await aiService.generateProjectInsights(id)
      setAiInsight(data?.insight || null)
    } catch (error) {
      console.error('Failed to generate AI insights:', error)
    } finally {
      setAiLoading(false)
    }
  }

  const handleCreateTask = async (formData) => {
    try {
      console.log('Creating task with data:', { ...formData, projectId: id })
      const newTask = await taskService.create({ ...formData, projectId: id })
      console.log('Task created:', newTask)
      setTasks((prev) => [...prev, newTask])
      const detailBits = []
      const assignees = formData.assignees || []
      const collaborators = formData.collaborators || []
      if (assignees.length > 0) detailBits.push(`assigned to ${assignees.length} user(s)`)
      if (collaborators.length > 0) detailBits.push(`collaborators ${collaborators.length}`)
      const detailSuffix = detailBits.length ? ` (${detailBits.join(', ')})` : ''
      pushActivityEntry(`Task "${newTask.title || formData.title}" created by ${user?.name || 'Unknown'}${detailSuffix}`)
      setTimeout(() => {
        refreshProjectActivity()
      }, 400)
    } catch (error) {
      console.error('Failed to create task:', error)
      throw error
    }
  }

  const handleDragEnd = async (result) => {
    if (!result.destination) return
    
    const { draggableId, destination } = result
    const newStatus = normalizeTaskStatus(destination.droppableId)
    const draggedTask = tasks.find(task => task._id === draggableId)
    if (draggedTask) {
      const normalizedCurrent = normalizeTaskStatus(draggedTask.status)
      const currentIndex = TASK_STATUS_ORDER.indexOf(normalizedCurrent)
      const nextIndex = TASK_STATUS_ORDER.indexOf(newStatus)
      if (currentIndex !== -1 && nextIndex !== -1 && nextIndex < currentIndex) {
        return
      }
      const isReviewer = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager' || draggedTask.assigned_by?._id === user?._id || draggedTask.assigned_by_id === user?._id
      if (normalizedCurrent === TASK_STATUS.NOT_STARTED) {
        const allowedNext = isReviewer
          ? [TASK_STATUS.NOT_STARTED, TASK_STATUS.IN_PROGRESS, TASK_STATUS.HOLD]
          : [TASK_STATUS.NOT_STARTED, TASK_STATUS.IN_PROGRESS]
        if (!allowedNext.includes(newStatus)) {
          return
        }
      }
      const canComplete = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager' || draggedTask.assigned_by?._id === user?._id || draggedTask.assigned_by_id === user?._id
      if (newStatus === TASK_STATUS.COMPLETED) {
        if (normalizedCurrent !== TASK_STATUS.REVIEW || !canComplete) {
          return
        }
      }
    }

    if (newStatus === TASK_STATUS.HOLD && draggedTask) {
      setHoldReasonText('')
      setHoldReasonModal({
        task: draggedTask,
        status: newStatus,
        title: 'Log the reason to On Hold this Task'
      })
      return
    }

    // Optimistic update
    setTasks((prev) => prev.map(task => 
      task._id === draggableId ? { ...task, status: newStatus } : task
    ))
    if (draggedTask) {
      const statusLabel = TASK_STATUS_LABELS[newStatus] || newStatus
      pushActivityEntry(`Task "${draggedTask.title || 'Task'}" status changed to ${statusLabel} by ${user?.name || 'Unknown'}`)
    }

    try {
      const updatedTask = await taskService.updateStatus(draggableId, newStatus)
      if (updatedTask) {
        setTasks((prev) => prev.map(task => task._id === draggableId ? updatedTask : task))
      }
      refreshProjectActivity()
    } catch (error) {
      console.error('Failed to update task status:', error)
      loadData() // Revert on error
    }
  }

  const handleAddTask = (status) => {
    setInitialStatus(status)
    openModal('newTask')
  }

  const handleTaskClick = (task) => {
    navigate(`/tasks/${task._id}`)
  }

  const handleAddGoal = async () => {
    if (!newGoal.trim()) return
    try {
      const updatedProject = await projectService.addGoal(id, newGoal)
      setProject(updatedProject)
      setGoals(updatedProject.weeklyGoals || updatedProject.weekly_goals || [])
      setNewGoal('')
      setActivity(updatedProject.activity || [])
    } catch (error) {
      console.error('Failed to add goal:', error)
    }
  }

  const isGoalAchieved = (goal) => {
    if (!goal) return false
    if (goal.status) return goal.status === 'achieved'
    return Boolean(goal.achieved_at || goal.achievedAt)
  }

  const groupedTasks = groupTasksByStatus(tasks)
  const achievedGoalsCount = goals.filter((goal) => isGoalAchieved(goal)).length
  const progress = calculateProgress(achievedGoalsCount, goals.length)

  const handleOpenEdit = () => {
    if (project) {
      openModal('editProject', { project })
    }
  }

  const handleUpdateProject = async (projectId, formData) => {
    try {
      const updatedProject = await projectService.update(projectId, {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        startDate: formData.startDate,
        endDate: formData.endDate,
        accessUserIds: formData.accessUserIds || []
      })
      if (updatedProject) {
        setProject(updatedProject)
        setGoals(updatedProject.weeklyGoals || updatedProject.weekly_goals || [])
        setActivity(updatedProject.activity || [])
      } else {
        pushActivityEntry(`Project updated by ${user?.name || 'Unknown'}`)
      }
    } catch (error) {
      console.error('Failed to update project:', error)
      throw error
    }
  }

  const handleDeleteProject = async (projectId) => {
    try {
      await projectService.delete(projectId, true)
      navigate('/groups')
    } catch (error) {
      console.error('Failed to delete project:', error)
      throw error
    }
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim() && attachments.length === 0) return
    try {
      const comment = await projectService.addComment(id, newComment, attachments)
      setComments([...comments, comment])
      setNewComment('')
      setAttachments([])
      const entry = {
        description: comment.parent_id ? `Reply added: "${comment.content}"` : `Comment added: "${comment.content}"`,
        timestamp: new Date().toISOString()
      }
      setActivity((prev) => [entry, ...(prev || [])])
    } catch (error) {
      console.error('Failed to add comment:', error)
    }
  }

  const handleReplySubmit = async (parentId) => {
    const text = replyDrafts[parentId] || ''
    if (!text.trim()) return
    try {
      const comment = await projectService.addComment(id, text, [], parentId)
      setComments([...comments, comment])
      setReplyDrafts((prev) => ({ ...prev, [parentId]: '' }))
      const entry = {
        description: `Reply added: "${comment.content}"`,
        timestamp: new Date().toISOString()
      }
      setActivity((prev) => [entry, ...(prev || [])])
    } catch (error) {
      console.error('Failed to add reply:', error)
    }
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (event) => {
        setAttachments(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: event.target.result
        }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Project not found</p>
        <button onClick={() => navigate(-1)} className="btn-primary mt-4">
          Go Back
        </button>
      </div>
    )
  }

  const statusClass = PROJECT_STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-700'
  const statusLabel = PROJECT_STATUS_LABELS[project.status] || project.status
  const userId = user?._id || user?.id
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager'
  const accessUsers = project.accessUsers || project.access_users || []
  const accessUserIds = project.accessUserIds || project.access_user_ids || []
  const memberMap = new Map()
  const orderedMembers = []
  const addMember = (member) => {
    if (!member) return
    const memberId = member._id || member.id || member.email || member.name
    if (!memberId || memberMap.has(memberId)) return
    memberMap.set(memberId, member)
    orderedMembers.push(member)
  }
  addMember(project.owner)
  accessUsers.forEach(addMember)
  ;(project.members || []).forEach(addMember)
  ;(project.collaborators || []).forEach(addMember)
  const teamMembers = orderedMembers

  const canToggleGoal = (goal) => {
    if (!goal) return false
    const currentId = String(userId || '')
    if (isAdmin) return true
    if (String(goal.created_by_id) === currentId) return true
    const projectId = String(project?._id || '')
    const groupId = String(project?.groupId || project?.group_id || '')
    if (projectId && canCreateInProject(projectId, groupId)) return true
    const accessIds = new Set([
      String(project?.owner?._id || project?.owner?.id || ''),
      ...accessUserIds.map((id) => String(id || '')),
      ...accessUsers.map((member) => String(member?._id || member?.id || '')),
      ...(project?.collaborators || []).map((member) => String(member?._id || member?.id || ''))
    ])
    accessIds.delete('')
    return accessIds.has(currentId)
  }

  const handleToggleGoal = async (goal) => {
    if (!goal) return
    const goalId = goal.id
    const nextAchieved = !isGoalAchieved(goal)
    setGoalStatusUpdating((prev) => ({ ...prev, [goalId]: true }))
    setGoals((prev) => prev.map((item) => {
      if (item.id !== goalId) return item
      return {
        ...item,
        status: nextAchieved ? 'achieved' : 'pending',
        achieved_at: nextAchieved ? new Date().toISOString() : null,
        achieved_by_name: nextAchieved ? (user?.name || 'Unknown') : null,
        achieved_by_id: nextAchieved ? userId : null
      }
    }))
    try {
      const updatedProject = await projectService.updateGoalStatus(id, goalId, nextAchieved)
      setProject(updatedProject)
      setGoals(updatedProject.weeklyGoals || updatedProject.weekly_goals || [])
      setActivity(updatedProject.activity || [])
    } catch (error) {
      console.error('Failed to update goal status:', error)
      refreshProjectActivity()
    } finally {
      setGoalStatusUpdating((prev) => {
        const copy = { ...prev }
        delete copy[goalId]
        return copy
      })
    }
  }

  const handleHoldReasonConfirm = async (reason) => {
    if (!holdReasonModal?.task) return
    setHoldReasonSaving(true)
    try {
      const { task, status } = holdReasonModal
      const updatedTask = await taskService.updateStatus(task._id, status, reason)
      if (updatedTask) {
        setTasks((prev) => prev.map((item) => item._id === task._id ? updatedTask : item))
        const reasonSnippet = reason ? ` Reason: "${reason}"` : ''
        pushActivityEntry(
          `Task "${task.title || 'Task'}" status changed to ${TASK_STATUS_LABELS[status] || status} by ${user?.name || 'Unknown'}${reasonSnippet}`
        )
      }
      await refreshProjectActivity()
    } catch (error) {
      console.error('Failed to update task status:', error)
      loadData()
    } finally {
      setHoldReasonSaving(false)
      setHoldReasonModal(null)
      setHoldReasonText('')
    }
  }

  const sortedComments = [...comments].sort((a, b) => {
    const ta = new Date(a.created_at || a.createdAt || 0).getTime()
    const tb = new Date(b.created_at || b.createdAt || 0).getTime()
    return ta - tb
  })
  const commentTree = sortedComments.reduce((acc, comment) => {
    const parentId = comment.parent_id || comment.parentId || null
    if (!acc[parentId]) acc[parentId] = []
    acc[parentId].push(comment)
    return acc
  }, {})

  const renderComment = (comment, depth = 0) => {
    const children = commentTree[comment._id] || []
    const createdTs = comment.created_at || comment.createdAt || null
    const relativeStamp = createdTs ? getRelativeTime(createdTs) : 'just now'
    const exactStamp = createdTs ? formatDateTime(createdTs) : ''
    return (
      <div key={comment._id} className="flex gap-3" style={{ marginLeft: depth * 20 }}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0 ${getAvatarColor(comment.user?.name)}`}>
          {getInitials(comment.user?.name)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{comment.user?.name || 'Unknown'}</span>
            <span className="text-xs text-gray-500">
              {relativeStamp}{exactStamp ? ` | ${exactStamp}` : ''}
            </span>
          </div>
          <p className="text-gray-700 mt-1 whitespace-pre-wrap">{comment.content}</p>
          {comment.attachments?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {comment.attachments.map((att, i) => (
                <div key={i} className="relative">
                  {att.type?.startsWith('image/') ? (
                    <img src={att.data || att.url} alt={att.name} className="max-w-xs max-h-32 rounded-lg border" />
                  ) : (
                    <a href={att.data || att.url} download={att.name} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                      <Paperclip size={14} />
                      {att.name}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => setReplyDrafts((prev) => ({ ...prev, [comment._id]: prev[comment._id] || '' }))}
              className="text-xs text-primary-600 hover:underline"
            >
              Reply
            </button>
          </div>
          {replyDrafts[comment._id] !== undefined && (
            <div className="mt-2 space-y-2 border-l pl-3">
              <textarea
                value={replyDrafts[comment._id]}
                onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [comment._id]: e.target.value }))}
                className="input-field w-full min-h-[60px]"
                placeholder="Write a reply..."
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleReplySubmit(comment._id)}
                  className="btn-primary px-3 py-2 text-sm"
                  disabled={!replyDrafts[comment._id]?.trim()}
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => setReplyDrafts((prev) => {
                    const copy = { ...prev }
                    delete copy[comment._id]
                    return copy
                  })}
                  className="btn-secondary px-3 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {children.length > 0 && (
            <div className="mt-3 space-y-3">
              {children.map((child) => renderComment(child, depth + 1))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <span className={`px-3 py-1 text-sm rounded-full ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
          {project.description && (
            <p className="text-gray-500 mt-1">{project.description}</p>
          )}
        </div>
        <button 
          onClick={handleOpenEdit}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Edit project"
        >
          <Settings size={20} className="text-gray-500" />
        </button>
      </div>

      {/* Project Info Bar */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-gray-500 mb-1">Owner</p>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs ${getAvatarColor(project.owner?.name)}`}>
                {getInitials(project.owner?.name)}
              </div>
              <span className="text-sm font-medium">{project.owner?.name || 'Unassigned'}</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Project Access</p>
            {accessUsers.length > 0 ? (
              <div className="flex -space-x-2">
                {accessUsers.slice(0, 4).map((member) => (
                  <div
                    key={member._id || member.id || member.email}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] border-2 border-white ${getAvatarColor(member.name)}`}
                    title={member.name}
                  >
                    {getInitials(member.name)}
                  </div>
                ))}
                {accessUsers.length > 4 && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-gray-200 text-gray-700 border-2 border-white">
                    +{accessUsers.length - 4}
                  </div>
                )}
              </div>
            ) : accessUserIds.length > 0 ? (
              <span className="text-sm text-gray-900">{accessUserIds.length} user(s)</span>
            ) : (
              <span className="text-sm text-gray-900">Owner only</span>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Health Score</p>
            <span className={`text-lg font-bold ${
              progress >= 70 ? 'text-green-600' :
              progress >= 40 ? 'text-yellow-600' : 'text-red-600'
            }`}>{progress}%</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Tasks</p>
            <span className="text-lg font-bold text-gray-900">{tasks.length}</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Start Date</p>
            <span className="text-sm text-gray-900">{formatDate(project.startDate) || '—'}</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Due Date</p>
            <span className="text-sm text-gray-900">{formatDate(project.endDate) || 'No deadline'}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => openModal('projectActivity')}
            className="btn-secondary flex items-center gap-2"
          >
            <CalendarDays size={16} />
            Activity Log
          </button>
          {teamMembers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Team:</span>
              <div className="flex -space-x-2">
                {teamMembers.slice(0, 5).map((collab, idx) => (
                  <div 
                    key={idx}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs border-2 border-white ${getAvatarColor(collab.name)}`}
                    title={collab.name}
                  >
                    {getInitials(collab.name)}
                  </div>
                ))}
                {teamMembers.length > 5 && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs bg-gray-200 text-gray-600 border-2 border-white">
                    +{teamMembers.length - 5}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {[
            { id: 'board', label: 'Board', icon: null },
            { id: 'goals', label: 'Goals & Achievements', icon: Target },
            { id: 'insights', label: 'Insights', icon: BarChart3 }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon && <tab.icon size={16} />}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'board' && (
        <>
          {/* Add Task Button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => handleAddTask(TASK_STATUS.NOT_STARTED)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={18} />
              Add Task
            </button>
          </div>
          
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
            {TASK_STATUS_ORDER.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={groupedTasks[status] || []}
                onAddTask={handleAddTask}
                onTaskClick={handleTaskClick}
              />
            ))}
            </div>
          </DragDropContext>
        </>
      )}


      {activeTab === 'goals' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <Target className="text-primary-600" size={20} />
              <h3 className="font-semibold text-gray-900">Project Goals & Achievements</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="Write a project goal..."
                className="input-field flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAddGoal()
                  }
                }}
              />
              <button onClick={handleAddGoal} className="btn-primary" disabled={!newGoal.trim()}>Add</button>
            </div>
            <div className="space-y-3">
              {goals.map((goal) => {
                const isAchieved = isGoalAchieved(goal)
                const canToggle = canToggleGoal(goal)
                const updating = Boolean(goalStatusUpdating[goal.id])
                const createdAt = formatDateTime(goal.created_at || goal.createdAt)
                const achievedAt = formatDateTime(goal.achieved_at || goal.achievedAt)
                const achievedBy = goal.achieved_by_name || goal.achievedByName || 'Unknown'
                return (
                  <div key={goal.id} className="p-3 rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={isAchieved}
                        disabled={!canToggle || updating}
                        onChange={() => handleToggleGoal(goal)}
                      />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-base ${isAchieved ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                            {goal.text}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            isAchieved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {isAchieved ? 'Achieved' : 'Pending'}
                          </span>
                          {updating && <span className="text-xs text-gray-400">Updating...</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          By {goal.created_by_name || 'Unknown'} | {createdAt}
                        </div>
                        {isAchieved && (
                          <div className="text-xs text-green-600 mt-1">
                            Achieved on {achievedAt || createdAt} by {achievedBy}
                          </div>
                        )}
                        {!canToggle && (
                          <div className="text-xs text-gray-400 mt-1">
                            Only project access users or the goal owner can update this goal.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {goals.length === 0 && (
                <p className="text-gray-400 text-sm">No goals added yet. Start with a project goal above.</p>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Comments ({comments.length})</h3>
            <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
              {(commentTree[null] || []).map((comment) => renderComment(comment, 0))}
              {comments.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">No comments yet. Be the first to comment!</p>
              )}
            </div>

            <form onSubmit={handleAddComment} className="space-y-3">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-lg">
                  {attachments.map((att, i) => (
                    <div key={i} className="relative group">
                      {att.type?.startsWith('image/') ? (
                        <img src={att.data} alt={att.name} className="h-16 w-16 object-cover rounded" />
                      ) : (
                        <div className="h-16 w-16 flex items-center justify-center bg-gray-200 rounded">
                          <Paperclip size={20} />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ?
                      </button>
                      <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs truncate px-1 rounded-b">
                        {att.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Start new comment... (Press Shift+Enter for new line)"
                  className="input-field w-full min-h-[80px] resize-y"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (newComment.trim() || attachments.length > 0) {
                        handleAddComment(e)
                      }
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                      title="Attach file"
                    >
                      <Paperclip size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                      title="Attach image"
                    >
                      <Image size={20} />
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="btn-primary disabled:opacity-50 flex items-center gap-2"
                    disabled={!newComment.trim() && attachments.length === 0}
                  >
                    <Send size={18} />
                    Post Comment
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {activeTab === 'insights' && (
        <ProjectAIInsights
          insight={aiInsight}
          loading={aiLoading}
          onGenerate={handleGenerateAiInsights}
          tasks={tasks}
          projectName={project?.name}
        />
      )}

      {/* Modal */}
      {activeModal === 'newTask' && (
        <NewTaskModal 
          projectId={id}
          initialStatus={initialStatus}
          onSubmit={handleCreateTask}
          users={allUsers}
        />
      )}

      {activeModal === 'editProject' && modalData?.project && (
        <EditProjectModal
          project={modalData.project}
          onSubmit={handleUpdateProject}
          onDelete={handleDeleteProject}
          users={allUsers}
        />
      )}

      {activeModal === 'projectActivity' && (
        <ActivityLogModal
          title={`${project.name} Activity`}
          activity={activity}
          members={teamMembers}
        />
      )}

      {holdReasonModal && (
        <ReasonModal
          title={holdReasonModal.title}
          value={holdReasonText}
          onChange={setHoldReasonText}
          onClose={() => {
            setHoldReasonModal(null)
            setHoldReasonText('')
          }}
          onConfirm={handleHoldReasonConfirm}
          loading={holdReasonSaving}
        />
      )}
    </div>
  )
}
