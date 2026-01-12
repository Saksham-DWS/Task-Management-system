import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListTodo, Clock, PauseCircle, CheckCircle, Plus } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAuthStore } from '../../store/auth.store'
import { useAccess } from '../../hooks/useAccess'
import { taskService } from '../../services/task.service'
import { projectService } from '../../services/project.service'
import api from '../../services/api'
import NewTaskModal from '../../components/Modals/NewTaskModal'
import { isOverdue, formatDate } from '../../utils/helpers'
import { TASK_STATUS, TASK_STATUS_LABELS, TASK_STATUS_COLORS, PRIORITY, PRIORITY_LABELS, PRIORITY_COLORS, normalizeTaskStatus } from '../../utils/constants'

export default function MyWork() {
  const navigate = useNavigate()
  const { activeModal, openModal } = useUIStore()
  const { user } = useAuthStore()
  const { canCreateInProject, isManager } = useAccess()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [filter, setFilter] = useState(TASK_STATUS.IN_PROGRESS)
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [assignedByFilter, setAssignedByFilter] = useState('all')
  const [assignedToFilter, setAssignedToFilter] = useState('all')

  useEffect(() => {
    loadTasks()
    loadProjects()
    loadUsers()
  }, [])

  const loadTasks = async () => {
    setLoading(true)
    try {
      const data = await taskService.getMyTasks()
      setTasks(data)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const getFilteredTasks = () => {
    let filtered = tasks

    // Status filter
    if (filter !== 'all') {
      filtered = filtered.filter(t => normalizeTaskStatus(t.status) === filter)
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(t => t.priority === priorityFilter)
    }

    // Assigned by filter
    if (assignedByFilter !== 'all') {
      filtered = filtered.filter((t) => {
        const assignedById = String(t.assigned_by?._id || t.assigned_by_id || '')
        return assignedById && assignedById === assignedByFilter
      })
    }

    // Assigned to filter
    if (assignedToFilter !== 'all') {
      filtered = filtered.filter((t) => {
        const assigneeIds = (t.assignees?.length
          ? t.assignees.map((a) => a._id || a.id)
          : t.assignee_ids
        ) || []
        return assigneeIds.map((id) => String(id)).includes(assignedToFilter)
      })
    }

    return filtered
  }

  const countByStatus = (status) => tasks.filter(t => normalizeTaskStatus(t.status) === status).length
  const statusCounts = {
    total: tasks.length,
    inProgress: countByStatus(TASK_STATUS.IN_PROGRESS),
    onHold: countByStatus(TASK_STATUS.HOLD),
    completed: countByStatus(TASK_STATUS.COMPLETED)
  }

  const loadProjects = async () => {
    setProjectsLoading(true)
    try {
      const data = await projectService.getAll()
      const allowedProjects = isManager()
        ? data
        : data.filter((project) => {
            const projectId = project._id || project.id
            const groupId = project.groupId || project.group_id
            return canCreateInProject(String(projectId), groupId ? String(groupId) : '')
          })
      setProjects(allowedProjects)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setProjectsLoading(false)
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

  const handleCreateTask = async (formData) => {
    try {
      const newTask = await taskService.create(formData)
      setTasks((prev) => [newTask, ...prev])
    } catch (error) {
      console.error('Failed to create task:', error)
      throw error
    }
  }

  const handleOpenNewTask = () => {
    openModal('newTask')
  }
  const overdueTasks = tasks.filter(
    t => isOverdue(t.dueDate) && normalizeTaskStatus(t.status) !== TASK_STATUS.COMPLETED
  )

  const filteredTasks = getFilteredTasks()

  const userMap = useMemo(() => {
    const map = {}
    users.forEach((u) => {
      const id = String(u._id || u.id || '')
      if (id) {
        map[id] = u
      }
    })
    return map
  }, [users])

  const assignedByOptions = useMemo(() => {
    const ids = new Set()
    tasks.forEach((t) => {
      const id = t.assigned_by?._id || t.assigned_by_id
      if (id) ids.add(String(id))
    })
    return Array.from(ids).map((id) => ({
      id,
      label: userMap[id]?.name || userMap[id]?.email || id
    })).sort((a, b) => a.label.localeCompare(b.label))
  }, [tasks, userMap])

  const assignedToOptions = useMemo(() => {
    const ids = new Set()
    tasks.forEach((t) => {
      const list = (t.assignees?.length
        ? t.assignees.map((a) => a._id || a.id)
        : t.assignee_ids
      ) || []
      list.forEach((id) => {
        if (id) ids.add(String(id))
      })
    })
    return Array.from(ids).map((id) => ({
      id,
      label: userMap[id]?.name || userMap[id]?.email || id
    })).sort((a, b) => a.label.localeCompare(b.label))
  }, [tasks, userMap])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Work</h1>
        <p className="text-gray-500 mt-1">
          {user?.role === 'super_admin' ? 'All tasks in the system' : 'All tasks assigned to you'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <ListTodo className="text-primary-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{statusCounts.total}</p>
              <p className="text-sm text-gray-500">All Tasks</p>
            </div>
          </div>
        </div>

        <div className="card text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{statusCounts.inProgress}</p>
              <p className="text-sm text-gray-500">In Progress</p>
            </div>
          </div>
        </div>

        <div className="card text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <PauseCircle className="text-amber-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{statusCounts.onHold}</p>
              <p className="text-sm text-gray-500">On Hold</p>
            </div>
          </div>
        </div>

        <div className="card text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-emerald-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{statusCounts.completed}</p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters + Action */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Status:</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input-field py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value={TASK_STATUS.IN_PROGRESS}>{TASK_STATUS_LABELS[TASK_STATUS.IN_PROGRESS]}</option>
              <option value={TASK_STATUS.HOLD}>{TASK_STATUS_LABELS[TASK_STATUS.HOLD]}</option>
              <option value={TASK_STATUS.REVIEW}>{TASK_STATUS_LABELS[TASK_STATUS.REVIEW]}</option>
              <option value={TASK_STATUS.COMPLETED}>{TASK_STATUS_LABELS[TASK_STATUS.COMPLETED]}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="input-field py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value={PRIORITY.HIGH}>High</option>
              <option value={PRIORITY.MEDIUM}>Medium</option>
              <option value={PRIORITY.LOW}>Low</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Assigned By:</span>
            <select
              value={assignedByFilter}
              onChange={(e) => setAssignedByFilter(e.target.value)}
              className="input-field py-1.5 text-sm"
            >
              <option value="all">All</option>
              {assignedByOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Assigned To:</span>
            <select
              value={assignedToFilter}
              onChange={(e) => setAssignedToFilter(e.target.value)}
              className="input-field py-1.5 text-sm"
            >
              <option value="all">All</option>
              {assignedToOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {!projectsLoading && projects.length > 0 && (
          <button
            type="button"
            onClick={handleOpenNewTask}
            className="btn-primary"
          >
            <Plus size={18} />
            New Task
          </button>
        )}
      </div>

      {/* Task List */}
      <div className="card">
        {filteredTasks.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {filteredTasks.map(task => {
              const normalizedStatus = normalizeTaskStatus(task.status)
              const overdue = isOverdue(task.dueDate) && normalizedStatus !== TASK_STATUS.COMPLETED
              const priorityClass = PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-700'
              const statusClass = TASK_STATUS_COLORS[normalizedStatus] || 'bg-gray-100 text-gray-700'
              const statusLabel = TASK_STATUS_LABELS[normalizedStatus] || task.status
              const assignedById = String(task.assigned_by?._id || task.assigned_by_id || '')
              const assignedByName = task.assigned_by?.name || userMap[assignedById]?.name || userMap[assignedById]?.email || 'Unknown'
              const assigneeList = (task.assignees?.length
                ? task.assignees.map((a) => a.name || a.email).filter(Boolean)
                : (task.assignee_ids || []).map((id) => userMap[String(id)]?.name || userMap[String(id)]?.email).filter(Boolean)
              )
              const assigneeLabel = assigneeList.length ? assigneeList.join(', ') : 'Unassigned'
              
              return (
                <div 
                  key={task._id}
                  onClick={() => navigate(`/tasks/${task._id}`)}
                  className="py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-6 px-6 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      task.priority === PRIORITY.HIGH ? 'bg-red-500' :
                      task.priority === PRIORITY.MEDIUM ? 'bg-yellow-500' : 'bg-green-500'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{task.title}</p>
                      <p className="text-sm text-gray-500 truncate">
                        {task.project?.name || 'No project'} • {task.group?.name || 'No group'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        Assigned by: {assignedByName} | Assigned to: {assigneeLabel}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`px-2 py-1 text-xs rounded-full ${priorityClass}`}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    <span className={`text-sm ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No tasks match your filters</p>
            <button 
              onClick={() => { setFilter('all'); setPriorityFilter('all'); setAssignedByFilter('all'); setAssignedToFilter('all'); }}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium mt-2"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* AI Suggestion */}
      {overdueTasks.length > 0 && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 text-lg">💡</span>
            </div>
            <div>
              <h4 className="font-medium text-blue-900">AI Suggestion</h4>
              <p className="text-sm text-blue-700 mt-1">
                You have {overdueTasks.length} overdue task{overdueTasks.length > 1 ? 's' : ''}. 
                Consider prioritizing "{overdueTasks[0]?.title}" first as it may be blocking other work.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'newTask' && (
        <NewTaskModal
          projects={projects}
          users={users}
          initialStatus={TASK_STATUS.NOT_STARTED}
          onSubmit={handleCreateTask}
        />
      )}
    </div>
  )
}
