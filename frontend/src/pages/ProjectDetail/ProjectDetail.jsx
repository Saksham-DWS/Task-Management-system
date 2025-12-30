import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext } from '@hello-pangea/dnd'
import { ArrowLeft, Settings, Target, Trophy, Users, BarChart3, Plus, CalendarDays, Send, Paperclip, Image } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAuthStore } from '../../store/auth.store'
import { useAccess } from '../../hooks/useAccess'
import { projectService } from '../../services/project.service'
import { taskService } from '../../services/task.service'
import api from '../../services/api'
import KanbanColumn from '../../components/Kanban/KanbanColumn'
import NewTaskModal from '../../components/Modals/NewTaskModal'
import EditProjectModal from '../../components/Modals/EditProjectModal'
import ActivityLogModal from '../../components/Modals/ActivityLogModal'
import AISummary from '../../components/AI/AISummary'
import { groupTasksByStatus, calculateProgress, getInitials, getAvatarColor, formatDate, formatDateTime, getRelativeTime } from '../../utils/helpers'
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, TASK_STATUS, TASK_STATUS_ORDER, normalizeTaskStatus } from '../../utils/constants'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeModal, openModal, closeModal, modalData } = useUIStore()
  const { user } = useAuthStore()
  const { canCreateInProject } = useAccess()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('board')
  const [goals, setGoals] = useState([])
  const [newGoal, setNewGoal] = useState('')
  const [achievementDrafts, setAchievementDrafts] = useState({})
  const [initialStatus, setInitialStatus] = useState(TASK_STATUS.NOT_STARTED)
  const [allUsers, setAllUsers] = useState([])
  const [activity, setActivity] = useState([])
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [replyDrafts, setReplyDrafts] = useState({})
  const [attachments, setAttachments] = useState([])
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

  const handleCreateTask = async (formData) => {
    try {
      console.log('Creating task with data:', { ...formData, projectId: id })
      const newTask = await taskService.create({ ...formData, projectId: id })
      console.log('Task created:', newTask)
      setTasks([...tasks, newTask])
      await loadData() // Reload to get fresh data
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
      const canComplete = user?.role === 'admin' || user?.role === 'manager' || draggedTask.assigned_by?._id === user?._id || draggedTask.assigned_by_id === user?._id
      if (newStatus === TASK_STATUS.COMPLETED) {
        if (normalizedCurrent !== TASK_STATUS.REVIEW || !canComplete) {
          return
        }
      }
    }

    // Optimistic update
    setTasks(tasks.map(task => 
      task._id === draggableId ? { ...task, status: newStatus } : task
    ))

    try {
      await taskService.updateStatus(draggableId, newStatus)
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
      setGoals(updatedProject.weeklyGoals || [])
      setNewGoal('')
      setActivity(updatedProject.activity || [])
    } catch (error) {
      console.error('Failed to add goal:', error)
    }
  }

  const handleAddAchievement = async (goalId) => {
    const text = achievementDrafts[goalId] || ''
    if (!text.trim()) return
    try {
      const updatedProject = await projectService.addAchievement(id, goalId, text)
      setProject(updatedProject)
      setGoals(updatedProject.weeklyGoals || [])
      setAchievementDrafts((prev) => ({ ...prev, [goalId]: '' }))
      setActivity(updatedProject.activity || [])
    } catch (error) {
      console.error('Failed to add achievement:', error)
    }
  }

  const groupedTasks = groupTasksByStatus(tasks)
  const achievedGoalsCount = goals.filter((g) => (g.achievements || []).length > 0).length
  const progress = calculateProgress(achievedGoalsCount, goals.length)

  const handleOpenEdit = () => {
    if (project) {
      openModal('editProject', { project })
    }
  }

  const handleUpdateProject = async (projectId, formData) => {
    try {
      await projectService.update(projectId, {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        startDate: formData.startDate,
        endDate: formData.endDate,
        accessUserIds: formData.accessUserIds || []
      })
      // Reload to ensure we have fresh activity and derived fields
      await loadData()
    } catch (error) {
      console.error('Failed to update project:', error)
      throw error
    }
  }

  const handleDeleteProject = async (projectId) => {
    try {
      await projectService.delete(projectId, true)
      navigate('/categories')
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
  const isAdmin = user?.role === 'admin' || user?.role === 'manager'
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

  const canLogAchievement = (goal) => {
    if (!goal) return false
    if (!goal.created_at) return false
    const created = new Date(goal.created_at)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const windowReached = (Date.now() - created.getTime()) >= sevenDaysMs
    const isOwnerOrAdmin = isAdmin || String(goal.created_by_id) === String(userId)
    return windowReached && isOwnerOrAdmin
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
                const canReply = canLogAchievement(goal)
                const replies = goal.achievements || []
                return (
                  <div key={goal.id} className="p-3 rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-start gap-3">
                      <Trophy className="text-yellow-500 mt-1" size={18} />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base text-gray-900">{goal.text}</span>
                          <span className="text-xs text-gray-500">
                            By {goal.created_by_name || 'Unknown'} | {formatDateTime(goal.created_at)}
                          </span>
                        </div>
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => setAchievementDrafts((prev) => ({ ...prev, [goal.id]: prev[goal.id] || '' }))}
                            className="text-sm text-primary-600 hover:underline disabled:opacity-50"
                            disabled={!canReply}
                          >
                            {canReply ? 'Log Achievement / Reply' : 'Available after 7 days (goal owner or admin)'}
                          </button>
                        </div>
                        {achievementDrafts[goal.id] !== undefined && (
                          <div className="mt-2 space-y-2 border-l pl-3">
                            <textarea
                              value={achievementDrafts[goal.id]}
                              onChange={(e) => setAchievementDrafts((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                              className="input-field w-full min-h-[60px]"
                              placeholder="Write achievement/update..."
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleAddAchievement(goal.id)}
                                className="btn-primary px-3 py-2 text-sm"
                                disabled={!achievementDrafts[goal.id]?.trim()}
                              >
                                Post
                              </button>
                              <button
                                type="button"
                                onClick={() => setAchievementDrafts((prev) => {
                                  const copy = { ...prev }
                                  delete copy[goal.id]
                                  return copy
                                })}
                                className="btn-secondary px-3 py-2 text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {replies.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {replies.map((reply) => (
                              <div key={reply.id} className="p-2 rounded bg-gray-50 border border-gray-200">
                                <p className="text-gray-800">{reply.text}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  By {reply.created_by_name || 'Unknown'} | {formatDateTime(reply.created_at)}
                                </p>
                              </div>
                            ))}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AISummary 
            title="Project Health"
            healthScore={progress}
            insights={[
              { type: 'insight', message: `${tasks.length} total tasks in this project` },
              { type: groupedTasks.blocked?.length > 0 ? 'warning' : 'positive', 
                message: groupedTasks.blocked?.length > 0 
                  ? `${groupedTasks.blocked.length} tasks are blocked`
                  : 'No blocked tasks' },
              { type: groupedTasks.completed?.length > 0 ? 'success' : 'insight',
                message: `${groupedTasks.completed?.length || 0} tasks completed` }
            ]}
          />
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">AI Recommendations</h3>
            <div className="space-y-3">
              {progress < 50 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                  Consider reducing scope or extending deadline - only {progress}% of goals achieved.
                </div>
              )}
              {groupedTasks.blocked?.length > 2 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  Multiple blocked tasks detected. Review and resolve blockers to improve velocity.
                </div>
              )}
              {progress >= 70 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  Great progress! Project is on track to meet weekly goals.
                </div>
              )}
            </div>
          </div>
        </div>
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
    </div>
  )
}
