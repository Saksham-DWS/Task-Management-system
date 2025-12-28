import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Trash2, Send, AlertTriangle, CheckCircle, Clock, Target, Trophy, Paperclip, X, Image } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAuthStore } from '../../store/auth.store'
import { useAccess } from '../../hooks/useAccess'
import { taskService } from '../../services/task.service'
import ConfirmDeleteModal from '../../components/Modals/ConfirmDeleteModal'
import { 
  getInitials, 
  getAvatarColor, 
  formatDate,
  formatDateTime,
  getRelativeTime,
  isOverdue 
} from '../../utils/helpers'
import { 
  TASK_STATUS, 
  TASK_STATUS_LABELS, 
  TASK_STATUS_COLORS,
  TASK_STATUS_ORDER,
  normalizeTaskStatus,
  PRIORITY,
  PRIORITY_LABELS,
  PRIORITY_COLORS
} from '../../utils/constants'

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { activeModal, openModal, closeModal } = useUIStore()
  const { canDeleteTask, canEditTask, canViewCategory, canViewProject } = useAccess()
  const fileInputRef = useRef(null)

  const [task, setTask] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [newGoal, setNewGoal] = useState('')
  const [newAchievement, setNewAchievement] = useState('')
  const [attachments, setAttachments] = useState([])

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [taskData, commentsData] = await Promise.all([
        taskService.getById(id),
        taskService.getComments(id)
      ])
      setTask(taskData)
      setComments(commentsData)
    } catch (error) {
      console.error('Failed to load task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    try {
      await taskService.updateStatus(id, newStatus)
      setTask({ ...task, status: newStatus })
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const handlePriorityChange = async (newPriority) => {
    try {
      await taskService.updatePriority(id, newPriority)
      setTask({ ...task, priority: newPriority })
    } catch (error) {
      console.error('Failed to update priority:', error)
    }
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim() && attachments.length === 0) return

    setSubmitting(true)
    try {
      const comment = await taskService.addComment(id, newComment, attachments)
      setComments([...comments, comment])
      setNewComment('')
      setAttachments([])
    } catch (error) {
      console.error('Failed to add comment:', error)
    } finally {
      setSubmitting(false)
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

  const handleDelete = async () => {
    try {
      await taskService.delete(id)
      navigate(-1)
    } catch (error) {
      console.error('Failed to delete task:', error)
      throw error
    }
  }

  const handleAddGoal = async () => {
    if (!newGoal.trim()) return
    const updatedGoals = [...(task.weekly_goals || task.weeklyGoals || []), { id: Date.now(), text: newGoal, status: 'pending' }]
    try {
      await taskService.update(id, { weekly_goals: updatedGoals })
      setTask({ ...task, weekly_goals: updatedGoals, weeklyGoals: updatedGoals })
      setNewGoal('')
    } catch (error) {
      console.error('Failed to add goal:', error)
      alert('Failed to add goal. Please try again.')
    }
  }

  const handleAddAchievement = async () => {
    if (!newAchievement.trim()) return
    const updatedAchievements = [...(task.weekly_achievements || task.weeklyAchievements || []), { id: Date.now(), text: newAchievement }]
    try {
      await taskService.update(id, { weekly_achievements: updatedAchievements })
      setTask({ ...task, weekly_achievements: updatedAchievements, weeklyAchievements: updatedAchievements })
      setNewAchievement('')
    } catch (error) {
      console.error('Failed to add achievement:', error)
      alert('Failed to add achievement. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 dark:text-gray-400">Task not found</p>
        <button onClick={() => navigate(-1)} className="btn-primary mt-4">
          Go Back
        </button>
      </div>
    )
  }

  const categoryId = task.category_id || task.categoryId
  const projectId = task.project_id || task.projectId
  const canSeeCategory = canViewCategory(categoryId)
  const canSeeProject = canViewProject(projectId, categoryId)
  const normalizedStatus = normalizeTaskStatus(task.status)
  const statusClass = TASK_STATUS_COLORS[normalizedStatus] || 'bg-gray-100 text-gray-700'
  const priorityClass = PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-700'
  const overdue = isOverdue(task.dueDate || task.due_date) && normalizedStatus !== TASK_STATUS.COMPLETED
  const goals = task.weekly_goals || task.weeklyGoals || []
  const achievements = task.weekly_achievements || task.weeklyAchievements || []
  const currentStatusIndex = TASK_STATUS_ORDER.indexOf(normalizedStatus)
  const allowedStatusOptions = currentStatusIndex === -1
    ? Object.keys(TASK_STATUS_LABELS)
    : TASK_STATUS_ORDER.slice(currentStatusIndex)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft size={20} className="dark:text-gray-300" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
            {canSeeCategory ? (
              <Link to={`/categories/${categoryId}`} className="hover:text-primary-600">
                {task.category?.name || 'Category'}
              </Link>
            ) : (
              <span className="text-gray-500">{task.category?.name || 'Category'}</span>
            )}
            <span>/</span>
            {canSeeProject ? (
              <Link to={`/projects/${projectId}`} className="hover:text-primary-600">
                {task.project?.name || 'Project'}
              </Link>
            ) : (
              <span className="text-gray-500">{task.project?.name || 'Project'}</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{task.title}</h1>
        </div>
        {canDeleteTask(task) && (
          <button 
            onClick={() => openModal('confirmDelete')}
            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 transition-colors"
          >
            <Trash2 size={20} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status & Priority */}
          <div className="card">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
                <select
                  value={normalizedStatus}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className={`px-3 py-2 rounded-lg font-medium text-sm ${statusClass} border-0 cursor-pointer`}
                  disabled={!canEditTask(task)}
                >
                  {allowedStatusOptions.map((value) => (
                    <option key={value} value={value}>
                      {TASK_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Priority</label>
                <select
                  value={task.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  className={`px-3 py-2 rounded-lg font-medium text-sm ${priorityClass} border-0 cursor-pointer`}
                  disabled={!canEditTask(task)}
                >
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              {overdue && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">
                  <AlertTriangle size={16} />
                  <span className="text-sm font-medium">Overdue</span>
                </div>
              )}
              {normalizedStatus === TASK_STATUS.COMPLETED && (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded-lg">
                  <CheckCircle size={16} />
                  <span className="text-sm font-medium">Completed</span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Description</h3>
            {task.description ? (
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{task.description}</p>
            ) : (
              <p className="text-gray-400 italic">No description provided</p>
            )}
          </div>

          {/* Subtasks */}
          {task.subtasks?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Subtasks</h3>
              <div className="space-y-2">
                {task.subtasks.map(subtask => (
                  <div key={subtask.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input 
                      type="checkbox" 
                      checked={subtask.completed}
                      onChange={() => {}}
                      className="rounded border-gray-300 text-primary-600"
                    />
                    <span className={subtask.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}>
                      {subtask.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task Goals */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Target className="text-blue-500" size={20} />
              <h3 className="font-semibold text-gray-900 dark:text-white">Task Goals</h3>
            </div>
            
            <div className="space-y-3 mb-4">
              {goals.map(goal => (
                <div key={goal.id} className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <span className="text-blue-600">🎯</span>
                  <div className="flex-1">
                    <span className="text-gray-700 dark:text-gray-300">{goal.text}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                      goal.status === 'achieved' ? 'bg-green-100 text-green-700' :
                      goal.status === 'missed' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {goal.status || 'pending'}
                    </span>
                  </div>
                </div>
              ))}
              {goals.length === 0 && (
                <p className="text-gray-400 text-sm">No goals set for this task. Add goals to track progress.</p>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="Add a goal for this task..."
                className="input-field flex-1"
                onKeyPress={(e) => e.key === 'Enter' && handleAddGoal()}
              />
              <button onClick={handleAddGoal} className="btn-primary">Add Goal</button>
            </div>
          </div>

          {/* Task Achievements */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="text-yellow-500" size={20} />
              <h3 className="font-semibold text-gray-900 dark:text-white">Task Achievements</h3>
            </div>
            
            <div className="space-y-3 mb-4">
              {achievements.map(achievement => (
                <div key={achievement.id} className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
                  <span className="text-green-600">✓</span>
                  <span className="text-gray-700 dark:text-gray-300">{achievement.text}</span>
                </div>
              ))}
              {achievements.length === 0 && (
                <p className="text-gray-400 text-sm">No achievements recorded. Add achievements to track what you've accomplished.</p>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newAchievement}
                onChange={(e) => setNewAchievement(e.target.value)}
                placeholder="Add an achievement..."
                className="input-field flex-1"
                onKeyPress={(e) => e.key === 'Enter' && handleAddAchievement()}
              />
              <button onClick={handleAddAchievement} className="btn-primary">Add</button>
            </div>
          </div>

          {/* Comments */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Comments ({comments.length})</h3>
            
            <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
              {comments.map(comment => (
                <div key={comment._id} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0 ${getAvatarColor(comment.user?.name)}`}>
                    {getInitials(comment.user?.name)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{comment.user?.name || 'Unknown'}</span>
                      <span className="text-xs text-gray-500">{getRelativeTime(comment.created_at || comment.createdAt)}</span>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 mt-1">{comment.content}</p>
                    {comment.attachments?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {comment.attachments.map((att, i) => (
                          <div key={i} className="relative">
                            {att.type?.startsWith('image/') ? (
                              <img src={att.data || att.url} alt={att.name} className="max-w-xs max-h-32 rounded-lg border" />
                            ) : (
                              <a href={att.data || att.url} download={att.name} className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
                                <Paperclip size={14} />
                                {att.name}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">No comments yet. Be the first to comment!</p>
              )}
            </div>

            {/* Comment Input */}
            <form onSubmit={handleAddComment} className="space-y-3">
              {/* Attachments Preview */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  {attachments.map((att, i) => (
                    <div key={i} className="relative group">
                      {att.type?.startsWith('image/') ? (
                        <img src={att.data} alt={att.name} className="h-16 w-16 object-cover rounded" />
                      ) : (
                        <div className="h-16 w-16 flex items-center justify-center bg-gray-200 dark:bg-gray-600 rounded">
                          <Paperclip size={20} />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
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
                  placeholder="Write a comment... (Press Shift+Enter for new line)"
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
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                      title="Attach file"
                    >
                      <Paperclip size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                      title="Attach image"
                    >
                      <Image size={20} />
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || (!newComment.trim() && attachments.length === 0)}
                    className="btn-primary disabled:opacity-50 flex items-center gap-2"
                  >
                    <Send size={18} />
                    Send
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details Card */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Details</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Assigned By</label>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs ${getAvatarColor(task.assigned_by?.name)}`}>
                    {getInitials(task.assigned_by?.name)}
                  </div>
                  <span className="text-gray-900 dark:text-white">{task.assigned_by?.name || 'Unknown'}</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Assignees</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(task.assignees || []).map(assignee => (
                    <div key={assignee._id} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs ${getAvatarColor(assignee.name)}`}>
                        {getInitials(assignee.name)}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{assignee.name}</span>
                    </div>
                  ))}
                  {(!task.assignees || task.assignees.length === 0) && (
                    <span className="text-gray-400 text-sm">No assignees</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Collaborators</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(task.collaborators || []).map(collab => (
                    <div key={collab._id} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs ${getAvatarColor(collab.name)}`}>
                        {getInitials(collab.name)}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{collab.name}</span>
                    </div>
                  ))}
                  {(!task.collaborators || task.collaborators.length === 0) && (
                    <span className="text-gray-400 text-sm">No collaborators</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Assigned Date</label>
                  <p className="text-gray-900 dark:text-white mt-1">
                    {formatDate(task.assigned_date || task.assignedDate) || 'Not set'}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Due Date</label>
                  <p className={`mt-1 ${overdue ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                    {formatDate(task.due_date || task.dueDate) || 'Not set'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Created</label>
                <p className="text-gray-900 dark:text-white mt-1">
                  {formatDate(task.created_at || task.createdAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Activity</h3>
            <div className="space-y-3">
              {(task.activity || []).slice(0, 10).map((activity, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Clock size={14} className="text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-gray-700 dark:text-gray-300">{activity.description}</p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(activity.timestamp || activity.time || activity.date)}
                    </p>
                  </div>
                </div>
              ))}
              {(!task.activity || task.activity.length === 0) && (
                <p className="text-gray-400 text-sm">No activity recorded</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      {activeModal === 'confirmDelete' && (
        <ConfirmDeleteModal
          title="Delete Task"
          message={`Are you sure you want to delete "${task.title}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onClose={() => closeModal()}
        />
      )}
    </div>
  )
}
