import { useMemo } from 'react'

const getProjectId = (project) => String(project?._id || project?.id || '')
const getGroupId = (project) => String(project?.group_id || project?.groupId || '')

const statusLabel = (status) => {
  if (status === 'hold' || status === 'on_hold') return 'On Hold'
  if (status === 'completed' || status === 'closed') return 'Closed'
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

const statusBadge = (status) => {
  const key = status === 'on_hold' ? 'hold' : status
  const styles = {
    ongoing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    hold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    closed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }
  return styles[key] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

export default function ProjectDetailsTable({ projects = [], tasks = [], groups = [] }) {
  const groupMap = useMemo(() => {
    const map = new Map()
    groups.forEach((group) => {
      const id = String(group?._id || group?.id || '')
      if (id) {
        map.set(id, group)
      }
    })
    return map
  }, [groups])

  const tasksByProject = useMemo(() => {
    const map = new Map()
    tasks.forEach((task) => {
      const projectId = String(task?.project_id || task?.projectId || '')
      if (!projectId) return
      if (!map.has(projectId)) {
        map.set(projectId, [])
      }
      map.get(projectId).push(task)
    })
    return map
  }, [tasks])

  if (!projects.length) {
    return <p className="text-gray-400 text-center py-8">No projects found</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Project</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Group</th>
            <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
            <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Tasks</th>
            <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Completed</th>
            <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Health</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const projectId = getProjectId(project)
            const projectTasks = tasksByProject.get(projectId) || []
            const completedTasks = projectTasks.filter((task) => task.status === 'completed')
            const group = groupMap.get(getGroupId(project))
            const health = projectTasks.length
              ? Math.round((completedTasks.length / projectTasks.length) * 100)
              : 0
            const status = project.status

            return (
              <tr key={projectId} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{project.name}</td>
                <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{group?.name || 'N/A'}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`px-2 py-1 text-xs rounded-full ${statusBadge(status)}`}>
                    {statusLabel(status)}
                  </span>
                </td>
                <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{projectTasks.length}</td>
                <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{completedTasks.length}</td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`font-medium ${
                      health >= 70 ? 'text-green-600' : health >= 40 ? 'text-yellow-600' : 'text-red-600'
                    }`}
                  >
                    {health}%
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
