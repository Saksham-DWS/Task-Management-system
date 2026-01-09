import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  FolderKanban, 
  Briefcase,
  ListTodo, 
  Bell,
  Users, 
  LineChart, 
  FileBarChart, 
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut
} from 'lucide-react'
import { useUIStore } from '../store/ui.store'
import { useAccess } from '../hooks/useAccess'
import { useAuth } from '../hooks/useAuth'

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const { isManager, userAccess } = useAccess()
  const { user, logout, refreshUser } = useAuth()

  // Always refresh user/access on mount so newly granted project/group access appears
  useEffect(() => {
    refreshUser().catch(() => {})
  }, [])

  const normalizeAccessIds = (ids) => {
    if (!Array.isArray(ids)) return []
    return ids
      .map((id) => {
        if (id && typeof id === 'object') {
          return id._id || id.id || ''
        }
        return id
      })
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  }

  const groupIds = normalizeAccessIds([
    ...(userAccess?.groupIds ?? []),
    ...(userAccess?.group_ids ?? [])
  ])
  const projectIds = normalizeAccessIds([
    ...(userAccess?.projectIds ?? []),
    ...(userAccess?.project_ids ?? [])
  ])
  const hasGroupAccess = isManager() || groupIds.length > 0
  const hasProjectAccess = isManager() || groupIds.length > 0 || projectIds.length > 0

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', show: true },
    { path: '/groups', icon: FolderKanban, label: 'Groups', show: hasGroupAccess },
    { path: '/projects', icon: Briefcase, label: 'Projects', show: hasProjectAccess },
    { path: '/my-work', icon: ListTodo, label: 'My Work', show: true },
    { path: '/notifications', icon: Bell, label: 'Notifications', show: true },
    { path: '/teams', icon: Users, label: 'Teams & Access', requiresManager: true, show: true },
    { path: '/insights', icon: LineChart, label: 'Insights', show: isManager() },
    { path: '/reports', icon: FileBarChart, label: 'Reports', show: true },
    { path: '/settings', icon: Settings, label: 'Settings', show: true }
  ].filter((item) => item.show !== false)

  return (
    <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white dark:bg-[#0a0a0a] border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300`}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
        {sidebarOpen && (
          <div className="flex items-center gap-3">
            {/* DWS Logo */}
            <div className="w-10 h-10 bg-black dark:bg-white rounded-lg flex items-center justify-center">
              <span className="text-white dark:text-black font-bold text-lg">D</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white">DWS</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Digital Web Solutions</p>
            </div>
          </div>
        )}
        <button 
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
        >
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            if (item.requiresManager && !isManager()) return null

            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
                    ${isActive 
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' 
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                  `}
                  title={!sidebarOpen ? item.label : ''}
                >
                  <item.icon size={20} />
                  {sidebarOpen && <span className="font-medium">{item.label}</span>}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
        {/* User Info */}
        {sidebarOpen && user && (
          <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {user.role}
              </p>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title="Logout"
        >
          <LogOut size={20} />
          {sidebarOpen && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  )
}
