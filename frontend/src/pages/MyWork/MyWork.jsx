import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, AlertTriangle, Clock, Filter } from 'lucide-react'
import { taskService } from '../../services/task.service'
import { isOverdue, isToday, formatDate } from '../../utils/helpers'
import { TASK_STATUS, TASK_STATUS_LABELS, PRIORITY, PRIORITY_LABELS, PRIORITY_COLORS } from '../../utils/constants'

export default function MyWork() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')

  useEffect(() => {
    loadTasks()
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
    if (filter === 'today') {
      filtered = filtered.filter(t => isToday(new Date(t.dueDate)))
    } else if (filter === 'overdue') {
      filtered = filtered.filter(t => isOverdue(t.dueDate) && t.status !== TASK_STATUS.COMPLETED)
    } else if (filter === 'blocked') {
      filtered = filtered.filter(t => t.status === TASK_STATUS.BLOCKED)
    } else if (filter === 'in_progress') {
      filtered = filtered.filter(t => t.status === TASK_STATUS.IN_PROGRESS)
    } else if (filter === 'review') {
      filtered = filtered.filter(t => t.status === TASK_STATUS.REVIEW)
    } else if (filter === 'completed') {
      filtered = filtered.filter(t => t.status === TASK_STATUS.COMPLETED)
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(t => t.priority === priorityFilter)
    }

    return filtered
  }

  const groupedTasks = {
    today: tasks.filter(t => isToday(new Date(t.dueDate)) && t.status !== TASK_STATUS.COMPLETED),
    overdue: tasks.filter(t => isOverdue(t.dueDate) && t.status !== TASK_STATUS.COMPLETED),
    thisWeek: tasks.filter(t => {
      const dueDate = new Date(t.dueDate)
      const today = new Date()
      const weekEnd = new Date(today)
      weekEnd.setDate(today.getDate() + 7)
      return dueDate > today && dueDate <= weekEnd && t.status !== TASK_STATUS.COMPLETED
    }),
    blocked: tasks.filter(t => t.status === TASK_STATUS.BLOCKED)
  }

  const filteredTasks = getFilteredTasks()

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
        <p className="text-gray-500 mt-1">All tasks assigned to you</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button 
          onClick={() => setFilter('overdue')}
          className={`card text-left transition-all ${filter === 'overdue' ? 'ring-2 ring-red-500' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-red-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{groupedTasks.overdue.length}</p>
              <p className="text-sm text-gray-500">Overdue</p>
            </div>
          </div>
        </button>

        <button 
          onClick={() => setFilter('today')}
          className={`card text-left transition-all ${filter === 'today' ? 'ring-2 ring-yellow-500' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Calendar className="text-yellow-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{groupedTasks.today.length}</p>
              <p className="text-sm text-gray-500">Due Today</p>
            </div>
          </div>
        </button>

        <button 
          onClick={() => setFilter('blocked')}
          className={`card text-left transition-all ${filter === 'blocked' ? 'ring-2 ring-orange-500' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Clock className="text-orange-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{groupedTasks.blocked.length}</p>
              <p className="text-sm text-gray-500">Blocked</p>
            </div>
          </div>
        </button>

        <button 
          onClick={() => setFilter('all')}
          className={`card text-left transition-all ${filter === 'all' ? 'ring-2 ring-primary-500' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <Filter className="text-primary-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
              <p className="text-sm text-gray-500">All Tasks</p>
            </div>
          </div>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Status:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input-field py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="today">Due Today</option>
            <option value="overdue">Overdue</option>
            <option value="in_progress">In Progress</option>
            <option value="review">In Review</option>
            <option value="blocked">Blocked</option>
            <option value="completed">Completed</option>
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
      </div>

      {/* Task List */}
      <div className="card">
        {filteredTasks.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {filteredTasks.map(task => {
              const overdue = isOverdue(task.dueDate) && task.status !== TASK_STATUS.COMPLETED
              const priorityClass = PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-700'
              
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
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`px-2 py-1 text-xs rounded-full ${priorityClass}`}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    <span className={`text-sm ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      task.status === TASK_STATUS.COMPLETED ? 'bg-green-100 text-green-700' :
                      task.status === TASK_STATUS.BLOCKED ? 'bg-red-100 text-red-700' :
                      task.status === TASK_STATUS.REVIEW ? 'bg-indigo-100 text-indigo-700' :
                      task.status === TASK_STATUS.IN_PROGRESS ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {TASK_STATUS_LABELS[task.status]}
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
              onClick={() => { setFilter('all'); setPriorityFilter('all'); }}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium mt-2"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* AI Suggestion */}
      {groupedTasks.overdue.length > 0 && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 text-lg">💡</span>
            </div>
            <div>
              <h4 className="font-medium text-blue-900">AI Suggestion</h4>
              <p className="text-sm text-blue-700 mt-1">
                You have {groupedTasks.overdue.length} overdue task{groupedTasks.overdue.length > 1 ? 's' : ''}. 
                Consider prioritizing "{groupedTasks.overdue[0]?.title}" first as it may be blocking other work.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
