import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Clock, Filter, Layers, ListChecks, RefreshCw, Users } from 'lucide-react'
import { aiService } from '../../services/ai.service'
import { groupService } from '../../services/group.service'
import { projectService } from '../../services/project.service'
import { taskService } from '../../services/task.service'
import api from '../../services/api'
import { formatDateTime } from '../../utils/helpers'
import FilterMultiSelect from '../../components/Inputs/FilterMultiSelect'
import ProjectDetailsTable from '../../components/Reports/ProjectDetailsTable'

const normalizeId = (value) => String(value || '')
const uniqueList = (items) => Array.from(new Set(items.filter(Boolean)))

const getGroupId = (group) => normalizeId(group?._id || group?.id)
const getProjectId = (project) => normalizeId(project?._id || project?.id)
const getProjectGroupId = (project) => normalizeId(project?.group_id || project?.groupId)
const getUserId = (user) => normalizeId(user?._id || user?.id)
const getTaskProjectId = (task) => normalizeId(task?.project_id || task?.projectId)

const isProjectClosed = (project) => ['completed', 'closed'].includes(String(project?.status || '').toLowerCase())

const getProjectEndDate = (project) => {
  const endDate = project?.endDate || project?.end_date || project?.dueDate || project?.due_date
  if (!endDate) return null
  const parsed = new Date(endDate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getTaskDueDate = (task) => {
  const dueDate = task?.dueDate || task?.due_date
  if (!dueDate) return null
  const parsed = new Date(dueDate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getTaskUserIds = (task) => {
  const ids = new Set()
  if (task?.assigned_by_id) ids.add(normalizeId(task.assigned_by_id))
  ;(task?.assignee_ids || []).forEach((id) => ids.add(normalizeId(id)))
  ;(task?.collaborator_ids || []).forEach((id) => ids.add(normalizeId(id)))
  ;(task?.assignees || []).forEach((assignee) => ids.add(normalizeId(assignee?._id || assignee?.id)))
  ;(task?.collaborators || []).forEach((collab) => ids.add(normalizeId(collab?._id || collab?.id)))
  return Array.from(ids).filter(Boolean)
}

const renderWithBold = (text) => {
  if (!text) return null
  const lines = String(text).split('\n')
  return lines.map((line, lineIndex) => {
    const segments = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
    return (
      <span key={`line-${lineIndex}`}>
        {segments.map((segment, index) => {
          if (segment.startsWith('**') && segment.endsWith('**')) {
            const value = segment.slice(2, -2)
            return (
              <strong key={`seg-${lineIndex}-${index}`} className="font-semibold text-primary-700">
                {value}
              </strong>
            )
          }
          return <span key={`seg-${lineIndex}-${index}`}>{segment}</span>
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    )
  })
}

export default function Insights() {
  const [loading, setLoading] = useState(true)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [aiInsight, setAiInsight] = useState(null)
  const [aiError, setAiError] = useState(null)
  const [groups, setGroups] = useState([])
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({
    groupIds: [],
    projectIds: [],
    userIds: []
  })

  const filtersRef = useRef(filters)
  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [groupData, projectData, taskData, userData] = await Promise.all([
        groupService.getAll(),
        projectService.getAll(),
        taskService.getAll(),
        api.get('/users')
      ])
      setGroups(groupData || [])
      setProjects(projectData || [])
      setTasks(taskData || [])
      setUsers(userData?.data || [])
      setDataLoaded(true)
    } catch (error) {
      console.error('Failed to load insights data:', error)
      setAiInsight(null)
      setAiError('Unable to load insights data.')
      setDataLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const groupMap = useMemo(() => {
    const map = new Map()
    groups.forEach((group) => {
      const id = getGroupId(group)
      if (id) map.set(id, group)
    })
    return map
  }, [groups])

  const projectMap = useMemo(() => {
    const map = new Map()
    projects.forEach((project) => {
      const id = getProjectId(project)
      if (id) map.set(id, project)
    })
    return map
  }, [projects])

  const openProjects = useMemo(() => projects.filter((project) => !isProjectClosed(project)), [projects])

  const projectUserMap = useMemo(() => {
    const map = new Map()
    const ensure = (projectId) => {
      if (!map.has(projectId)) {
        map.set(projectId, new Set())
      }
      return map.get(projectId)
    }

    projects.forEach((project) => {
      const projectId = getProjectId(project)
      if (!projectId) return
      const set = ensure(projectId)
      const ownerId = normalizeId(project?.owner_id || project?.ownerId)
      if (ownerId) set.add(ownerId)
      ;(project?.accessUserIds || project?.access_user_ids || []).forEach((id) => {
        const val = normalizeId(id)
        if (val) set.add(val)
      })
      ;(project?.collaboratorIds || project?.collaborator_ids || []).forEach((id) => {
        const val = normalizeId(id)
        if (val) set.add(val)
      })
    })

    tasks.forEach((task) => {
      const projectId = getTaskProjectId(task)
      if (!projectId) return
      const set = ensure(projectId)
      getTaskUserIds(task).forEach((id) => set.add(id))
    })

    return map
  }, [projects, tasks])

  const projectIdsByUser = useMemo(() => {
    const map = new Map()
    projectUserMap.forEach((userIds, projectId) => {
      userIds.forEach((userId) => {
        if (!map.has(userId)) {
          map.set(userId, new Set())
        }
        map.get(userId).add(projectId)
      })
    })
    return map
  }, [projectUserMap])

  const openProjectIdSet = useMemo(() => new Set(openProjects.map(getProjectId)), [openProjects])

  const groupIdsByUser = useMemo(() => {
    const map = new Map()
    projectIdsByUser.forEach((projectIds, userId) => {
      const groupIds = new Set()
      projectIds.forEach((projectId) => {
        if (!openProjectIdSet.has(projectId)) return
        const project = projectMap.get(projectId)
        const groupId = getProjectGroupId(project)
        if (groupId) groupIds.add(groupId)
      })
      map.set(userId, groupIds)
    })
    return map
  }, [projectIdsByUser, projectMap, openProjectIdSet])

  const applyFilterRules = useCallback(
    (draft) => {
      const next = {
        groupIds: uniqueList(draft.groupIds),
        projectIds: uniqueList(draft.projectIds),
        userIds: uniqueList(draft.userIds)
      }

      const validGroupIds = new Set(groups.map(getGroupId))
      next.groupIds = next.groupIds.filter((id) => validGroupIds.has(id))
      const validUserIds = new Set(users.map(getUserId))
      next.userIds = next.userIds.filter((id) => validUserIds.has(id))

      const selectableProjectIds = projects
        .filter((project) => !isProjectClosed(project))
        .map(getProjectId)
      const selectableProjectIdSet = new Set(selectableProjectIds)

      if (next.groupIds.length) {
        const allowedFromGroups = new Set(
          projects.filter((project) => next.groupIds.includes(getProjectGroupId(project))).map(getProjectId)
        )
        next.projectIds = next.projectIds.filter((id) => allowedFromGroups.has(id))
      }

      if (next.userIds.length) {
        const allowedFromUsers = new Set()
        next.userIds.forEach((userId) => {
          const projectIds = projectIdsByUser.get(userId)
          if (projectIds) {
            projectIds.forEach((projectId) => allowedFromUsers.add(projectId))
          }
        })
        next.projectIds = next.projectIds.filter((id) => allowedFromUsers.has(id))
      }

      next.projectIds = next.projectIds.filter((id) => selectableProjectIdSet.has(id))

      if (!next.groupIds.length && next.projectIds.length) {
        const groupIds = next.projectIds.map((id) => getProjectGroupId(projectMap.get(id)))
        next.groupIds = uniqueList(groupIds)
      }

      if (next.userIds.length && !next.projectIds.length) {
        const projectIds = []
        next.userIds.forEach((userId) => {
          const ids = projectIdsByUser.get(userId)
          if (ids) {
            ids.forEach((projectId) => projectIds.push(projectId))
          }
        })
        next.projectIds = uniqueList(projectIds).filter((id) => selectableProjectIdSet.has(id))
      }

      if (next.userIds.length && !next.groupIds.length) {
        const groupIds = []
        next.userIds.forEach((userId) => {
          const ids = groupIdsByUser.get(userId)
          if (ids) {
            ids.forEach((groupId) => groupIds.push(groupId))
          }
        })
        next.groupIds = uniqueList(groupIds)
      }

      if (next.projectIds.length) {
        const groupIds = uniqueList(next.projectIds.map((id) => getProjectGroupId(projectMap.get(id))))
        next.groupIds = uniqueList([...next.groupIds, ...groupIds])
      }

      const projectIdsForUsers = next.projectIds.length
        ? next.projectIds
        : openProjects.filter((project) => next.groupIds.includes(getProjectGroupId(project))).map(getProjectId)
      if (projectIdsForUsers.length) {
        const allowedUserIds = new Set()
        projectIdsForUsers.forEach((projectId) => {
          const members = projectUserMap.get(projectId)
          if (members) {
            members.forEach((userId) => allowedUserIds.add(userId))
          }
        })
        next.userIds = next.userIds.filter((id) => allowedUserIds.has(id))
      }

      return next
    },
    [groups, projects, users, projectIdsByUser, groupIdsByUser, projectMap, projectUserMap, openProjects]
  )

  useEffect(() => {
    setFilters((current) => {
      const next = applyFilterRules(current)
      const changed =
        next.groupIds.join('|') !== current.groupIds.join('|') ||
        next.projectIds.join('|') !== current.projectIds.join('|') ||
        next.userIds.join('|') !== current.userIds.join('|')
      return changed ? next : current
    })
  }, [applyFilterRules])

  const updateFilters = (partial) => {
    setFilters((current) => {
      const next = applyFilterRules({ ...current, ...partial })
      const changed =
        next.groupIds.join('|') !== current.groupIds.join('|') ||
        next.projectIds.join('|') !== current.projectIds.join('|') ||
        next.userIds.join('|') !== current.userIds.join('|')
      return changed ? next : current
    })
  }

  const projectHasUser = useCallback(
    (projectId, userIds) => {
      const members = projectUserMap.get(projectId)
      if (!members || !userIds.length) return false
      return userIds.some((id) => members.has(id))
    },
    [projectUserMap]
  )

  const taskHasUser = useCallback((task, userIds) => {
    if (!userIds.length) return true
    const ids = getTaskUserIds(task)
    return userIds.some((id) => ids.includes(id))
  }, [])

  const projectOptions = useMemo(() => {
    let pool = projects
    if (filters.groupIds.length) {
      pool = pool.filter((project) => filters.groupIds.includes(getProjectGroupId(project)))
    }
    if (filters.userIds.length) {
      pool = pool.filter((project) => projectHasUser(getProjectId(project), filters.userIds))
    }
    return pool.map((project) => {
      const groupName = groupMap.get(getProjectGroupId(project))?.name
      const closed = isProjectClosed(project)
      return {
        id: getProjectId(project),
        label: project.name || 'Project',
        meta: groupName ? `Group: ${groupName}` : undefined,
        disabled: closed,
        badge: closed ? 'Closed' : undefined
      }
    })
  }, [projects, filters.groupIds, filters.userIds, groupMap, projectHasUser])

  const groupOptions = useMemo(() => {
    let pool = groups
    if (filters.projectIds.length) {
      const groupIds = new Set(
        filters.projectIds.map((projectId) => getProjectGroupId(projectMap.get(projectId)))
      )
      pool = groups.filter((group) => groupIds.has(getGroupId(group)))
    } else if (filters.userIds.length) {
      const groupIds = new Set()
      filters.userIds.forEach((userId) => {
        const ids = groupIdsByUser.get(userId)
        if (ids) {
          ids.forEach((gid) => groupIds.add(gid))
        }
      })
      pool = groups.filter((group) => groupIds.has(getGroupId(group)))
    }
    return pool.map((group) => ({
      id: getGroupId(group),
      label: group.name || 'Group',
      meta: `${group.projectCount || 0} projects`
    }))
  }, [groups, filters.projectIds, filters.userIds, groupIdsByUser, projectMap])

  const userOptions = useMemo(() => {
    let pool = users
    if (filters.projectIds.length || filters.groupIds.length) {
      const projectIds = filters.projectIds.length
        ? filters.projectIds
        : openProjects.filter((project) => filters.groupIds.includes(getProjectGroupId(project))).map(getProjectId)
      const allowedUsers = new Set()
      projectIds.forEach((projectId) => {
        const members = projectUserMap.get(projectId)
        if (members) {
          members.forEach((uid) => allowedUsers.add(uid))
        }
      })
      pool = users.filter((user) => allowedUsers.has(getUserId(user)))
    }
    return pool.map((user) => ({
      id: getUserId(user),
      label: user.name || 'User',
      meta: user.email || undefined
    }))
  }, [users, filters.projectIds, filters.groupIds, openProjects, projectUserMap])

  const filteredProjects = useMemo(() => {
    let pool = openProjects
    if (filters.groupIds.length) {
      pool = pool.filter((project) => filters.groupIds.includes(getProjectGroupId(project)))
    }
    if (filters.projectIds.length) {
      pool = pool.filter((project) => filters.projectIds.includes(getProjectId(project)))
    }
    if (filters.userIds.length) {
      pool = pool.filter((project) => projectHasUser(getProjectId(project), filters.userIds))
    }
    return pool
  }, [projects, filters.groupIds, filters.projectIds, filters.userIds, projectHasUser])

  const filteredTasks = useMemo(() => {
    const projectIds = new Set(filteredProjects.map(getProjectId))
    let pool = tasks.filter((task) => projectIds.has(getTaskProjectId(task)))
    if (filters.userIds.length) {
      pool = pool.filter((task) => taskHasUser(task, filters.userIds))
    }
    return pool
  }, [tasks, filteredProjects, filters.userIds, taskHasUser])

  const filteredTasksByProject = useMemo(() => {
    const map = new Map()
    filteredTasks.forEach((task) => {
      const projectId = getTaskProjectId(task)
      if (!projectId) return
      if (!map.has(projectId)) {
        map.set(projectId, [])
      }
      map.get(projectId).push(task)
    })
    return map
  }, [filteredTasks])

  const filteredGroups = useMemo(() => {
    const groupIds = new Set(filteredProjects.map(getProjectGroupId))
    return groups.filter((group) => groupIds.has(getGroupId(group)))
  }, [groups, filteredProjects])

  const hasActiveFilters = useMemo(
    () => filters.groupIds.length > 0 || filters.projectIds.length > 0 || filters.userIds.length > 0,
    [filters.groupIds.length, filters.projectIds.length, filters.userIds.length]
  )

  const kpi = useMemo(() => {
    const totalGroups = new Set(filteredProjects.map(getProjectGroupId)).size
    const totalProjects = filteredProjects.length
    const ongoing = filteredProjects.filter((project) => project.status === 'ongoing').length
    const overdue = filteredProjects.filter((project) => {
      const endDate = getProjectEndDate(project)
      return endDate && endDate < new Date() && !isProjectClosed(project)
    }).length
    const totalTasks = filteredTasks.length
    const overdueTasks = filteredTasks.filter((task) => {
      const dueDate = getTaskDueDate(task)
      return dueDate && dueDate < new Date() && task.status !== 'completed'
    }).length
    return { totalGroups, totalProjects, ongoing, overdue, totalTasks, overdueTasks }
  }, [filteredProjects, filteredTasks])

  const groupInsights = useMemo(() => {
    return filteredGroups.map((group) => {
      const groupProjects = filteredProjects.filter(
        (project) => getProjectGroupId(project) === getGroupId(group)
      )
      const projectIds = groupProjects.map(getProjectId)
      const groupTasks = filteredTasks.filter((task) => projectIds.includes(getTaskProjectId(task)))
      const completed = groupTasks.filter((task) => task.status === 'completed').length
      const overdue = groupTasks.filter((task) => {
        const due = getTaskDueDate(task)
        return due && due < new Date() && task.status !== 'completed'
      }).length
      const completionRate = groupTasks.length
        ? Math.round((completed / groupTasks.length) * 100)
        : 0
      return {
        id: getGroupId(group),
        name: group.name,
        insight: `${group.name} has ${groupProjects.length} active projects with ${completionRate}% task completion and ${overdue} overdue task(s).`
      }
    })
  }, [filteredGroups, filteredProjects, filteredTasks])

  const projectInsights = useMemo(() => {
    return filteredProjects.slice(0, 6).map((project) => {
      const projectTasks = filteredTasksByProject.get(getProjectId(project)) || []
      const completed = projectTasks.filter((task) => task.status === 'completed').length
      const overdue = projectTasks.filter((task) => {
        const due = getTaskDueDate(task)
        return due && due < new Date() && task.status !== 'completed'
      }).length
      const completionRate = projectTasks.length
        ? Math.round((completed / projectTasks.length) * 100)
        : 0
      const statusLabel =
        project.status === 'hold' || project.status === 'on_hold'
          ? 'on hold'
          : project.status === 'completed'
          ? 'closed'
          : project.status || 'ongoing'
      return {
        id: getProjectId(project),
        name: project.name,
        insight: `${project.name} is ${statusLabel}, ${completionRate}% tasks completed with ${overdue} overdue task(s).`
      }
    })
  }, [filteredProjects, filteredTasksByProject])

  const groupPerformance = useMemo(() => {
    return filteredGroups.map((group) => {
      const groupProjects = filteredProjects.filter(
        (project) => getProjectGroupId(project) === getGroupId(group)
      )
      const healthScores = groupProjects.map((project) => {
        const projectTasks = filteredTasksByProject.get(getProjectId(project)) || []
        const completed = projectTasks.filter((task) => task.status === 'completed').length
        return projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0
      })
      const avgHealth = healthScores.length
        ? Math.round(healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length)
        : 0
      return {
        id: getGroupId(group),
        name: group.name,
        projectCount: groupProjects.length,
        avgHealth
      }
    })
  }, [filteredGroups, filteredProjects, filteredTasksByProject])

  const requestInsights = useCallback(async (filtersPayload) => {
    setGenerating(true)
    try {
      const data = await aiService.getFilteredAdminInsights(filtersPayload)
      setAiInsight(data?.insight || null)
      setAiError(data?.insight?.ai_error || null)
    } catch (error) {
      console.error('Failed to generate insights:', error)
      setAiError('Unable to generate AI insights.')
    } finally {
      setGenerating(false)
    }
  }, [])

  useEffect(() => {
    if (!dataLoaded) return
    const timer = setTimeout(() => {
      requestInsights(filtersRef.current)
    }, 3500)
    return () => clearTimeout(timer)
  }, [filters, dataLoaded, requestInsights])

  const handleRefresh = () => {
    requestInsights(filtersRef.current)
  }

  const handleClearFilters = () => {
    updateFilters({ groupIds: [], projectIds: [], userIds: [] })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const overview = aiInsight?.overview
  const conclusions = aiInsight?.conclusions
  const recommendations = aiInsight?.recommendations
  const taskInsights = aiInsight?.task_insights || aiInsight?.taskInsights
  const userInsights = aiInsight?.user_insights || aiInsight?.userInsights || []
  const generatedAt = aiInsight?.generated_at || aiInsight?.generatedAt

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
        <p className="text-gray-500 mt-1">AI-powered analysis of your projects and tasks</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <Users className="text-primary-600" size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{kpi.totalGroups}</p>
              <p className="text-sm text-gray-500">Total Groups</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Layers className="text-blue-600" size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{kpi.totalProjects}</p>
              <p className="text-sm text-gray-500">Total Projects</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Clock className="text-green-600" size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{kpi.ongoing}</p>
              <p className="text-sm text-gray-500">Ongoing</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-red-600" size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{kpi.overdue}</p>
              <p className="text-sm text-gray-500">Overdue Projects</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <ListChecks className="text-orange-600" size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{kpi.overdueTasks}</p>
              <p className="text-sm text-gray-500">Overdue Tasks</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Filter className="text-gray-500" size={18} />
            <h3 className="font-semibold text-gray-900">Filters</h3>
          </div>
          <button
            type="button"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters}
            className="btn-secondary text-xs px-3 py-1 disabled:opacity-50"
          >
            Clear All
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FilterMultiSelect
            label="Groups"
            items={groupOptions}
            selectedIds={filters.groupIds}
            onChange={(groupIds) => updateFilters({ groupIds })}
            placeholder="Search groups..."
            searchPlaceholder="Search groups..."
          />
          <FilterMultiSelect
            label="Projects"
            items={projectOptions}
            selectedIds={filters.projectIds}
            onChange={(projectIds) => updateFilters({ projectIds })}
            placeholder="Search projects..."
            searchPlaceholder="Search projects..."
          />
          <FilterMultiSelect
            label="Users"
            items={userOptions}
            selectedIds={filters.userIds}
            onChange={(userIds) => updateFilters({ userIds })}
            placeholder="Search users..."
            searchPlaceholder="Search users..."
          />
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Filters are connected. Insights refresh automatically after a short delay.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">AI Insights</h2>
            <p className="text-xs text-gray-500 mt-1">
              {generatedAt ? `Last generated: ${formatDateTime(generatedAt)}` : 'No insights generated yet'}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={generating}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Generating' : 'Refresh'}
          </button>
        </div>
        {aiError && <p className="text-sm text-red-500 mb-3">{aiError}</p>}
        {overview?.summary || overview?.bullets?.length ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Overview</h3>
              {overview?.summary && (
                <p className="text-sm text-gray-700 leading-relaxed">{renderWithBold(overview.summary)}</p>
              )}
              {overview?.bullets?.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
                  {overview.bullets.map((item, index) => (
                    <li key={`overview-${index}`}>{renderWithBold(item)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Conclusions</h3>
              {conclusions?.bullets?.length > 0 ? (
                <ul className="space-y-2 text-sm text-gray-700 list-disc list-inside">
                  {conclusions.bullets.map((item, index) => (
                    <li key={`conclusion-${index}`}>{renderWithBold(item)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No conclusions available yet.</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">AI Recommendations</h3>
              {recommendations?.bullets?.length > 0 ? (
                <ul className="space-y-2 text-sm text-gray-700 list-disc list-inside">
                  {recommendations.bullets.map((item, index) => (
                    <li key={`rec-${index}`}>{renderWithBold(item)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No recommendations available yet.</p>
              )}
            </div>
            {userInsights.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">User Insights</h3>
                {userInsights.map((user) => (
                  <div key={user.user_id || user.name} className="p-3 rounded-lg bg-gray-50">
                    <p className="font-medium text-gray-900">{user.name || 'User'}</p>
                    {user.overview?.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc list-inside">
                        {user.overview.map((item, index) => (
                          <li key={`user-overview-${index}`}>{renderWithBold(item)}</li>
                        ))}
                      </ul>
                    )}
                    {user.conclusions?.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc list-inside">
                        {user.conclusions.map((item, index) => (
                          <li key={`user-conclusion-${index}`}>{renderWithBold(item)}</li>
                        ))}
                      </ul>
                    )}
                    {user.recommendations?.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc list-inside">
                        {user.recommendations.map((item, index) => (
                          <li key={`user-rec-${index}`}>{renderWithBold(item)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">No insights yet. Filters will auto-refresh.</p>
        )}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks className="text-orange-600" size={20} />
          <h2 className="font-semibold text-gray-900">Task Insights</h2>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500">
              Total tasks in scope: <span className="font-semibold text-gray-900">{kpi.totalTasks}</span>
            </p>
            {taskInsights?.summary && (
              <p className="mt-2 text-sm text-gray-700 leading-relaxed">{renderWithBold(taskInsights.summary)}</p>
            )}
            {taskInsights?.bullets?.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
                {taskInsights.bullets.map((item, index) => (
                  <li key={`task-insight-${index}`}>{renderWithBold(item)}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-gray-100 max-h-80 overflow-auto">
            {filteredTasks.length > 0 ? (
              <ul className="divide-y divide-gray-100">
                {filteredTasks.map((task) => {
                  const projectName = projectMap.get(getTaskProjectId(task))?.name || 'Project'
                  const dueDate = getTaskDueDate(task)
                  const overdue = dueDate && dueDate < new Date() && task.status !== 'completed'
                  return (
                    <li key={normalizeId(task._id || task.id)} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">{task.title || 'Task'}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {projectName} · {task.status || 'status unknown'}
                            {task.priority ? ` · ${task.priority}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                            {dueDate ? `Due ${formatDateTime(dueDate)}` : 'No due date'}
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">No tasks available for this filter.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="text-blue-600" size={20} />
            <h2 className="font-semibold text-gray-900">Project Details</h2>
          </div>
          <ProjectDetailsTable projects={filteredProjects} tasks={filteredTasks} groups={groups} />
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="text-green-600" size={20} />
            <h2 className="font-semibold text-gray-900">Group Performance</h2>
          </div>
          <div className="space-y-4">
            {groupPerformance.length > 0 ? (
              groupPerformance.map((group) => (
                <div key={group.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{group.name}</p>
                    <p className="text-sm text-gray-500">{group.projectCount} projects</p>
                  </div>
                  <div
                    className={`text-lg font-bold ${
                      group.avgHealth >= 70
                        ? 'text-green-600'
                        : group.avgHealth >= 40
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}
                  >
                    {group.avgHealth}%
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-center py-4">No groups to analyze</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="text-blue-600" size={20} />
            <h2 className="font-semibold text-gray-900">Group Insights</h2>
          </div>
          <div className="space-y-3">
            {groupInsights.length > 0 ? (
              groupInsights.map((item) => (
                <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="text-sm text-gray-600 mt-1">{item.insight}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-center py-4">No group insights yet.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="text-green-600" size={20} />
            <h2 className="font-semibold text-gray-900">Project Insights</h2>
          </div>
          <div className="space-y-3">
            {projectInsights.length > 0 ? (
              projectInsights.map((item) => (
                <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="text-sm text-gray-600 mt-1">{item.insight}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-center py-4">No project insights yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
