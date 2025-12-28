import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext } from '@hello-pangea/dnd'
import { ArrowLeft, Settings, Target, Trophy, Users, BarChart3, Plus, CalendarDays } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useAccess } from '../../hooks/useAccess'
import { projectService } from '../../services/project.service'
import { taskService } from '../../services/task.service'
import api from '../../services/api'
import KanbanColumn from '../../components/Kanban/KanbanColumn'
import NewTaskModal from '../../components/Modals/NewTaskModal'
import EditProjectModal from '../../components/Modals/EditProjectModal'
import ActivityLogModal from '../../components/Modals/ActivityLogModal'
import AISummary from '../../components/AI/AISummary'
import { groupTasksByStatus, calculateProgress, getInitials, getAvatarColor, formatDate } from '../../utils/helpers'
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, TASK_STATUS, TASK_STATUS_ORDER, normalizeTaskStatus } from '../../utils/constants'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeModal, openModal, closeModal, modalData } = useUIStore()
  const { canCreateInProject } = useAccess()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('board')
  const [goals, setGoals] = useState([])
  const [achievements, setAchievements] = useState([])
  const [newGoal, setNewGoal] = useState('')
  const [newAchievement, setNewAchievement] = useState('')
  const [initialStatus, setInitialStatus] = useState(TASK_STATUS.NOT_STARTED)
  const [allUsers, setAllUsers] = useState([])
  const [activity, setActivity] = useState([])

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [projectData, tasksData, usersData] = await Promise.all([
        projectService.getById(id),
        taskService.getByProject(id),
        api.get('/users').then(res => res.data).catch(() => [])
      ])
      setProject(projectData)
      setTasks(tasksData)
      setAllUsers(usersData)
      setGoals(projectData.weeklyGoals || [])
      setAchievements(projectData.weeklyAchievements || [])
      setActivity(projectData.activity || [])
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
      const currentIndex = TASK_STATUS_ORDER.indexOf(normalizeTaskStatus(draggedTask.status))
      const nextIndex = TASK_STATUS_ORDER.indexOf(newStatus)
      if (currentIndex !== -1 && nextIndex !== -1 && nextIndex < currentIndex) {
        return
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
    const updatedGoals = [...goals, { id: Date.now(), text: newGoal, completed: false }]
    try {
      await projectService.updateGoals(id, updatedGoals)
      setGoals(updatedGoals)
      setNewGoal('')
    } catch (error) {
      console.error('Failed to add goal:', error)
    }
  }

  const handleAddAchievement = async () => {
    if (!newAchievement.trim()) return
    const updatedAchievements = [...achievements, { id: Date.now(), text: newAchievement }]
    try {
      await projectService.updateAchievements(id, updatedAchievements)
      setAchievements(updatedAchievements)
      setNewAchievement('')
    } catch (error) {
      console.error('Failed to add achievement:', error)
    }
  }

  const groupedTasks = groupTasksByStatus(tasks)
  const progress = calculateProgress(achievements.length, goals.length)

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
        endDate: formData.endDate
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
  ;(project.members || []).forEach(addMember)
  ;(project.collaborators || []).forEach(addMember)
  const teamMembers = orderedMembers

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
            { id: 'insights', label: 'Insights', icon: BarChart3 },
            { id: 'team', label: 'Team Load', icon: Users }
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
            {Object.entries(TASK_STATUS).map(([key, status]) => (
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Goals */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Target className="text-primary-600" size={20} />
              <h3 className="font-semibold text-gray-900">This Week's Goals</h3>
            </div>
            
            <div className="space-y-3 mb-4">
              {goals.map(goal => (
                <div key={goal.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <input 
                    type="checkbox" 
                    checked={goal.completed}
                    onChange={() => {}}
                    className="mt-0.5 rounded border-gray-300 text-primary-600"
                  />
                  <span className={goal.completed ? 'line-through text-gray-400' : 'text-gray-700'}>
                    {goal.text}
                  </span>
                </div>
              ))}
              {goals.length === 0 && (
                <p className="text-gray-400 text-sm">No goals set for this week</p>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="Add a new goal..."
                className="input-field flex-1"
                onKeyPress={(e) => e.key === 'Enter' && handleAddGoal()}
              />
              <button onClick={handleAddGoal} className="btn-primary">Add</button>
            </div>
          </div>

          {/* Achievements */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="text-yellow-500" size={20} />
              <h3 className="font-semibold text-gray-900">This Week's Achievements</h3>
            </div>
            
            <div className="space-y-3 mb-4">
              {achievements.map(achievement => (
                <div key={achievement.id} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <span className="text-green-600">✓</span>
                  <span className="text-gray-700">{achievement.text}</span>
                </div>
              ))}
              {achievements.length === 0 && (
                <p className="text-gray-400 text-sm">No achievements recorded yet</p>
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

      {activeTab === 'team' && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Team Workload</h3>
          {project.collaborators?.length > 0 ? (
            <div className="space-y-4">
              {project.collaborators.map((member, idx) => {
                const memberTasks = tasks.filter(t => 
                  t.assignees?.some(a => a._id === member._id)
                )
                const workload = memberTasks.length
                return (
                  <div key={idx} className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${getAvatarColor(member.name)}`}>
                      {getInitials(member.name)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900">{member.name}</span>
                        <span className="text-sm text-gray-500">{workload} tasks</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            workload > 10 ? 'bg-red-500' :
                            workload > 5 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(workload * 10, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No team members assigned to this project</p>
          )}
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
