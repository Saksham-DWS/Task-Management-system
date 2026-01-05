import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, Calendar, User } from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'
import { useAccess } from '../../hooks/useAccess'
import { taskService } from '../../services/task.service'
import { projectService } from '../../services/project.service'
import AISummary from '../../components/AI/AISummary'
import { isOverdue, formatDate } from '../../utils/helpers'
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from '../../utils/constants'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { isManager } = useAccess()
  const [recentProjects, setRecentProjects] = useState([])
  const [myTasks, setMyTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [projectsData, tasksData] = await Promise.all([
        projectService.getAll(),
        taskService.getMyTasks()
      ])
      // Get recent 5 projects
      setRecentProjects(projectsData.slice(0, 5))
      setMyTasks(tasksData)
      generateInsights(tasksData)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateInsights = (tasks) => {
    const newInsights = []
    const overdueTasks = tasks.filter(t => isOverdue(t.dueDate) && t.status !== 'completed')
    const highPriorityTasks = tasks.filter(t => t.priority === 'high' && t.status !== 'completed')
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress')

    if (overdueTasks.length > 0) {
      newInsights.push({
        type: 'warning',
        title: 'Attention Needed',
        message: `${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''} overdue. Review and update status.`
      })
    }

    if (highPriorityTasks.length > 0) {
      newInsights.push({
        type: 'insight',
        title: 'High Priority',
        message: `Focus on ${highPriorityTasks.length} high priority task${highPriorityTasks.length > 1 ? 's' : ''}.`
      })
    }

    if (inProgressTasks.length > 0) {
      newInsights.push({
        type: 'success',
        title: 'In Progress',
        message: `${inProgressTasks.length} task${inProgressTasks.length > 1 ? 's' : ''} actively being worked on.`
      })
    }

    if (newInsights.length === 0) {
      newInsights.push({
        type: 'success',
        title: 'All Clear',
        message: 'No urgent items. Great job staying on top of your work!'
      })
    }

    setInsights(newInsights)
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'bg-red-500'
      case 'medium': return 'bg-amber-500'
      default: return 'bg-gray-400'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome back, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Here's what's happening with your projects</p>
        </div>
        {isManager() && (
          <button 
            onClick={() => navigate('/groups')}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            Open Groups
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - My Tasks */}
        <div className="lg:col-span-2 space-y-6">
          {/* My Tasks */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Tasks</h2>
              <button 
                onClick={() => navigate('/my-work')}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
              >
                View All <ChevronRight size={16} />
              </button>
            </div>

            {myTasks.length > 0 ? (
              <div className="space-y-2">
                {myTasks.slice(0, 8).map(task => (
                  <div 
                    key={task._id}
                    onClick={() => navigate(`/tasks/${task._id}`)}
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border border-gray-100 dark:border-gray-800"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getPriorityColor(task.priority)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {task.project?.name || 'No project'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`px-2 py-1 text-xs rounded-full ${TASK_STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-700'}`}>
                        {TASK_STATUS_LABELS[task.status] || task.status}
                      </span>
                      {task.dueDate && (
                        <span className={`text-sm flex items-center gap-1 ${
                          isOverdue(task.dueDate) && task.status !== 'completed' 
                            ? 'text-red-600 dark:text-red-400' 
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          <Calendar size={14} />
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">No tasks assigned to you yet</p>
              </div>
            )}
          </div>

          {/* Recent Projects */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Projects</h2>
              <button 
                onClick={() => navigate('/groups')}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
              >
                View All <ChevronRight size={16} />
              </button>
            </div>

            {recentProjects.length > 0 ? (
              <div className="space-y-2">
                {recentProjects.map(project => (
                  <div 
                    key={project._id}
                    onClick={() => navigate(`/projects/${project._id}`)}
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border border-gray-100 dark:border-gray-800"
                  >
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: project.group?.color || '#6366f1' }}
                    >
                      {project.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{project.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {project.group?.name || 'No group'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {project.members?.length > 0 && (
                        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                          <User size={14} />
                          {project.members.length}
                        </div>
                      )}
                      <ChevronRight size={18} className="text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400 mb-4">No projects yet</p>
                {isManager() && (
                  <button 
                    onClick={() => navigate('/groups')}
                    className="btn-primary inline-flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Create Project
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - AI Insights */}
        {isManager() && (
          <div>
            <AISummary 
              title="AI Insights"
              insights={insights}
              onRefresh={loadData}
            />
          </div>
        )}
      </div>
    </div>
  )
}
