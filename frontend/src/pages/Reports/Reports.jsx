import { useState, useEffect } from 'react'
import { FileBarChart, Download, Calendar, Users, CheckCircle, Clock, Filter } from 'lucide-react'
import { groupService } from '../../services/group.service'
import { projectService } from '../../services/project.service'
import { taskService } from '../../services/task.service'
import ProjectDetailsTable from '../../components/Reports/ProjectDetailsTable'
import { useAccess } from '../../hooks/useAccess'
import { useAuthStore } from '../../store/auth.store'
import { TASK_STATUS_LABELS } from '../../utils/constants'

export default function Reports() {
  const { isManager } = useAccess()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('all')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [reportData, setReportData] = useState({
    groups: [],
    projects: [],
    tasks: [],
    completedTasks: 0,
    totalTasks: 0,
    avgCompletionTime: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  const isGlobalReports = isManager()
  const currentUserId = user?._id || user?.id

  const filterTasksForUser = (tasks) => {
    if (!currentUserId) return []
    const normalizedUserId = String(currentUserId)
    return tasks.filter((task) => {
      const assigneeIds = (task.assignees || []).map((assignee) => String(assignee._id || assignee.id))
      const collaboratorIds = (task.collaborators || []).map((collaborator) => String(collaborator._id || collaborator.id))
      return assigneeIds.includes(normalizedUserId) || collaboratorIds.includes(normalizedUserId)
    })
  }

  const loadData = async () => {
    setLoading(true)
    try {
      let groups = []
      let projects = []
      let tasks = []
      if (isGlobalReports) {
        const [groupsData, projectsData, tasksData] = await Promise.all([
          groupService.getAll(),
          projectService.getAll(),
          taskService.getAll()
        ])
        groups = groupsData
        projects = projectsData
        tasks = tasksData
      } else {
        const tasksData = await taskService.getMyTasks()
        const scopedTasks = filterTasksForUser(tasksData)
        if (scopedTasks.length > 0) {
          const [groupsData, projectsData] = await Promise.all([
            groupService.getAll(),
            projectService.getAll()
          ])
          const projectIds = new Set(scopedTasks.map((task) => task.project_id || task.projectId).filter(Boolean))
          const groupIds = new Set(scopedTasks.map((task) => task.group_id || task.groupId).filter(Boolean))

          projects = projectsData.filter((project) => projectIds.has(project._id))
          projects.forEach((project) => {
            const groupId = project.group_id || project.groupId
            if (groupId) {
              groupIds.add(groupId)
            }
          })
          groups = groupsData.filter((group) => groupIds.has(group._id))
        }
        tasks = scopedTasks
      }

      const completedTasks = tasks.filter(t => t.status === 'completed')
      
      setReportData({
        groups,
        projects,
        tasks,
        completedTasks: completedTasks.length,
        totalTasks: tasks.length,
        avgCompletionTime: calculateAvgCompletionTime(completedTasks)
      })
    } catch (error) {
      console.error('Failed to load report data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateAvgCompletionTime = (completedTasks) => {
    if (completedTasks.length === 0) return 0
    const totalDays = completedTasks.reduce((sum, task) => {
      const created = new Date(task.created_at || task.createdAt)
      const completed = new Date(task.completed_at || task.completedAt)
      if (created && completed) {
        return sum + Math.ceil((completed - created) / (1000 * 60 * 60 * 24))
      }
      return sum
    }, 0)
    return Math.round(totalDays / completedTasks.length) || 3
  }

  // Filter data based on selections
  const filteredProjects = reportData.projects.filter(p => {
    if (selectedGroup && (p.group_id || p.groupId) !== selectedGroup) return false
    if (selectedProject && p._id !== selectedProject) return false
    return true
  })

  const filteredTasks = reportData.tasks.filter(t => {
    if (selectedGroup && (t.group_id || t.groupId) !== selectedGroup) return false
    if (selectedProject && (t.project_id || t.projectId) !== selectedProject) return false
    return true
  })

  const getCompletionRate = () => {
    if (filteredTasks.length === 0) return 0
    const completed = filteredTasks.filter(t => t.status === 'completed').length
    return Math.round((completed / filteredTasks.length) * 100)
  }

  const getTasksByUser = () => {
    const userTasks = {}
    const normalizedUserId = currentUserId ? String(currentUserId) : null
    filteredTasks.forEach(task => {
      const assignees = task.assignees || []
      const collaborators = task.collaborators || []
      if (!isGlobalReports && normalizedUserId) {
        const match = assignees.find((assignee) => String(assignee._id || assignee.id) === normalizedUserId)
          || collaborators.find((collaborator) => String(collaborator._id || collaborator.id) === normalizedUserId)
        if (!match) {
          return
        }
        const name = match.name || user?.name || 'Me'
        if (!userTasks[name]) {
          userTasks[name] = { total: 0, completed: 0 }
        }
        userTasks[name].total++
        if (task.status === 'completed') {
          userTasks[name].completed++
        }
        return
      }
      assignees.forEach(assignee => {
        if (!assignee?.name) {
          return
        }
        if (!userTasks[assignee.name]) {
          userTasks[assignee.name] = { total: 0, completed: 0 }
        }
        userTasks[assignee.name].total++
        if (task.status === 'completed') {
          userTasks[assignee.name].completed++
        }
      })
    })
    return Object.entries(userTasks).map(([name, data]) => ({
      name,
      ...data,
      rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
    }))
  }

  const handleExport = () => {
    // Generate CSV
    const headers = ['Project', 'Group', 'Status', 'Tasks', 'Completed', 'Health Score']
    const rows = filteredProjects.map(p => {
      const projectTasks = filteredTasks.filter(t => (t.project_id || t.projectId) === p._id)
      const completedTasks = projectTasks.filter(t => t.status === 'completed')
      return [
        p.name,
        reportData.groups.find(c => c._id === (p.group_id || p.groupId))?.name || 'N/A',
        p.status,
        projectTasks.length,
        completedTasks.length,
        projectTasks.length > 0 ? Math.round((completedTasks.length / projectTasks.length) * 100) + '%' : 'N/A'
      ]
    })

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dws-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const userStats = getTasksByUser()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Performance metrics and analytics</p>
        </div>
        <button onClick={handleExport} className="btn-primary flex items-center gap-2">
          <Download size={18} />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="text-gray-500" size={18} />
          <h3 className="font-semibold text-gray-900 dark:text-white">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Group</label>
            <select
              value={selectedGroup}
              onChange={(e) => {
                setSelectedGroup(e.target.value)
                setSelectedProject('')
              }}
              className="input-field"
            >
              <option value="">All Groups</option>
              {reportData.groups.map(cat => (
                <option key={cat._id} value={cat._id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="input-field"
            >
              <option value="">All Projects</option>
              {reportData.projects
                .filter(p => !selectedGroup || (p.group_id || p.groupId) === selectedGroup)
                .map(proj => (
                  <option key={proj._id} value={proj._id}>{proj.name}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="input-field"
            >
              <option value="all">All Time</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
              <FileBarChart className="text-primary-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{filteredProjects.length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Projects</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{getCompletionRate()}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Completion Rate</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Clock className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{reportData.avgCompletionTime}d</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Avg. Completion Time</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Users className="text-purple-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{userStats.length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active Members</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Status */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Projects by Status</h2>
          <div className="space-y-3">
            {['ongoing', 'hold', 'completed'].map(status => {
              const count = filteredProjects.filter(p => p.status === status).length
              const percentage = filteredProjects.length > 0 
                ? Math.round((count / filteredProjects.length) * 100) 
                : 0
              const colors = {
                ongoing: 'bg-blue-500',
                hold: 'bg-yellow-500',
                completed: 'bg-green-500'
              }
                const labels = {
                  ongoing: 'Ongoing',
                  hold: 'On Hold',
                  completed: 'Closed'
                }
              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{labels[status]}</span>
                    <span className="text-sm font-medium dark:text-gray-300">{count} ({percentage}%)</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${colors[status]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Task Distribution */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Tasks by Status</h2>
          <div className="space-y-3">
            {['not_started', 'in_progress', 'hold', 'review', 'completed'].map(status => {
              const count = filteredTasks.filter(t => t.status === status).length
              const percentage = filteredTasks.length > 0 
                ? Math.round((count / filteredTasks.length) * 100) 
                : 0
              const colors = {
                not_started: 'bg-gray-400',
                in_progress: 'bg-blue-500',
                hold: 'bg-yellow-500',
                review: 'bg-indigo-500',
                completed: 'bg-green-500'
              }
              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{TASK_STATUS_LABELS[status] || status}</span>
                    <span className="text-sm font-medium dark:text-gray-300">{count} ({percentage}%)</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${colors[status]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Team Performance */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Team Performance</h2>
        {userStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Team Member</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Total Tasks</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Completed</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Completion Rate</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Progress</th>
                </tr>
              </thead>
              <tbody>
                {userStats.map((user, idx) => (
                  <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{user.name}</td>
                    <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{user.total}</td>
                    <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{user.completed}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-medium ${
                        user.rate >= 70 ? 'text-green-600' :
                        user.rate >= 40 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {user.rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            user.rate >= 70 ? 'bg-green-500' :
                            user.rate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${user.rate}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">No team data available</p>
        )}
      </div>

      {/* Projects Table */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Project Details</h2>
        <ProjectDetailsTable projects={filteredProjects} tasks={filteredTasks} groups={reportData.groups} />
      </div>
    </div>
  )
}
