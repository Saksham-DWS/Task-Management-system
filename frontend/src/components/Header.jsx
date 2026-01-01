import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bell, LogOut, User, ChevronDown, Sun, Moon } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUIStore } from '../store/ui.store'
import { getInitials, getAvatarColor } from '../utils/helpers'
import { notificationService } from '../services/notification.service'

export default function Header() {
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState([])
  const { user, logout } = useAuth()
  const { darkMode, toggleDarkMode } = useUIStore()
  const navigate = useNavigate()

  const unreadCount = notifications.filter((n) => !n.read).length

  const loadNotifications = async () => {
    try {
      const data = await notificationService.getAll()
      setNotifications(data)
    } catch (err) {
      console.error('Failed to load notifications', err)
    }
  }

  useEffect(() => {
    loadNotifications()
    const handleUpdate = () => loadNotifications()
    const intervalId = setInterval(loadNotifications, 60000)
    window.addEventListener('notifications:updated', handleUpdate)
    return () => {
      window.removeEventListener('notifications:updated', handleUpdate)
      clearInterval(intervalId)
    }
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleOpenNotifications = () => {
    navigate('/notifications')
  }

  return (
    <header className="h-16 bg-white dark:bg-[#0a0a0a] border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 transition-colors">
      {/* Search */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search categories, projects, tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-[#111111] border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={handleOpenNotifications}
            className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Bell size={20} className="text-gray-600 dark:text-gray-400" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? (
            <Sun size={20} className="text-gray-600 dark:text-gray-400" />
          ) : (
            <Moon size={20} className="text-gray-600 dark:text-gray-400" />
          )}
        </button>

        {/* User menu */}
        <div className="relative">
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(user?.name)}`}>
              {getInitials(user?.name)}
            </div>
            <span className="font-medium text-gray-700 dark:text-gray-200">{user?.name}</span>
            <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#111111] rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 py-1 z-50">
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 capitalize mt-1">{user?.role}</p>
              </div>
              <button
                onClick={() => {
                  setShowDropdown(false)
                  navigate('/settings')
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <User size={16} />
                Profile Settings
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
