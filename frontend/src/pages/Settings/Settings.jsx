import { useEffect, useState } from 'react'
import { User, Bell, Shield, Save } from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'
import { useUIStore } from '../../store/ui.store'
import { getInitials, getAvatarColor } from '../../utils/helpers'
import api from '../../services/api'
import { notificationService } from '../../services/notification.service'

export default function Settings() {
  const { user, updateUser } = useAuthStore()
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const [activeTab, setActiveTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const defaultNotificationPrefs = {
    in_app: true,
    email: true,
    task_assigned: true,
    task_completed: true,
    task_comments: true,
    project_comments: true,
    goal_assigned: true,
    goal_achieved: true,
    goal_comments: true,
    weekly_digest: false
  }

  const normalizePreferences = (prefs = {}) => ({
    in_app: prefs.in_app ?? defaultNotificationPrefs.in_app,
    email: prefs.email ?? defaultNotificationPrefs.email,
    task_assigned: prefs.task_assigned ?? defaultNotificationPrefs.task_assigned,
    task_completed: prefs.task_completed ?? defaultNotificationPrefs.task_completed,
    task_comments: prefs.task_comments ?? defaultNotificationPrefs.task_comments,
    project_comments: prefs.project_comments ?? defaultNotificationPrefs.project_comments,
    goal_assigned: prefs.goal_assigned ?? defaultNotificationPrefs.goal_assigned,
    goal_achieved: prefs.goal_achieved ?? defaultNotificationPrefs.goal_achieved,
    goal_comments: prefs.goal_comments ?? defaultNotificationPrefs.goal_comments,
    weekly_digest: prefs.weekly_digest ?? defaultNotificationPrefs.weekly_digest
  })

  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  const [notifications, setNotifications] = useState(
    normalizePreferences(user?.notification_preferences)
  )

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const data = await notificationService.getPreferences()
        const normalized = normalizePreferences(data)
        setNotifications(normalized)
        updateUser({ notification_preferences: normalized })
      } catch (error) {
        if (user?.notification_preferences) {
          setNotifications(normalizePreferences(user.notification_preferences))
        }
      }
    }
    loadPreferences()
  }, [user?._id])

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      updateUser({ name: profile.name, email: profile.email })
      setMessage({ type: 'success', text: 'Profile updated successfully' })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!user?._id && !user?.id) {
      setMessage({ type: 'error', text: 'Missing user profile. Please log in again.' })
      return
    }
    if (profile.newPassword !== profile.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }
    if (!profile.currentPassword || profile.currentPassword.length < 6) {
      setMessage({ type: 'error', text: 'Current password is required' })
      return
    }
    if (profile.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters' })
      return
    }
    
    setSaving(true)
    setMessage(null)
    
    try {
      const userId = user?._id || user?.id
      await api.put(`/users/${userId}/password`, {
        current_password: profile.currentPassword,
        new_password: profile.newPassword
      })
      setProfile({ ...profile, currentPassword: '', newPassword: '', confirmPassword: '' })
      setMessage({ type: 'success', text: 'Password changed successfully' })
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to change password' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotifications = async () => {
    setSaving(true)
    setMessage(null)
    
    try {
      const response = await notificationService.savePreferences(notifications)
      const normalized = normalizePreferences(response)
      setNotifications(normalized)
      updateUser({ notification_preferences: normalized })
      setMessage({ type: 'success', text: 'Notification preferences saved' })
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save preferences' })
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your account and preferences</p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' 
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tabs */}
        <div className="lg:col-span-1">
          <div className="card p-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === tab.id 
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <tab.icon size={20} />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {activeTab === 'profile' && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Profile Information</h2>
              
              {/* Avatar */}
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl ${getAvatarColor(user?.name)}`}>
                  {getInitials(user?.name)}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{user?.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 capitalize mt-1">{user?.role}</p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="pt-4">
                  <button type="submit" disabled={saving} className="btn-primary">
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Notification Preferences</h2>
              
              <div className="space-y-4">
                {[
                  { key: 'in_app', label: 'In-App Notifications', desc: 'Show notifications inside the app' },
                  { key: 'email', label: 'Email Notifications', desc: 'Receive notifications via email' },
                  { key: 'task_assigned', label: 'Task Assigned', desc: 'When a task is assigned to you' },
                  { key: 'task_completed', label: 'Task Completed', desc: 'When a task you\'re involved in is completed' },
                  { key: 'task_comments', label: 'Task Comments', desc: 'When someone comments on your tasks' },
                  { key: 'project_comments', label: 'Project Comments', desc: 'When someone comments on your projects' },
                  { key: 'goal_assigned', label: 'Goal Assigned', desc: 'When a goal is assigned to you' },
                  { key: 'goal_achieved', label: 'Goal Achieved', desc: 'When an assigned goal is marked achieved' },
                  { key: 'goal_comments', label: 'Goal Comments', desc: 'When someone comments on your goals' },
                  { key: 'weekly_digest', label: 'Weekly Digest', desc: 'Receive a weekly summary of your work' }
                ].map(item => (
                  <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications[item.key]}
                      onChange={(e) => setNotifications({ ...notifications, [item.key]: e.target.checked })}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 w-5 h-5"
                    />
                  </label>
                ))}

                <div className="pt-4">
                  <button onClick={handleSaveNotifications} disabled={saving} className="btn-primary">
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Change Password</h2>
              
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
                  <input
                    type="password"
                    value={profile.currentPassword}
                    onChange={(e) => setProfile({ ...profile, currentPassword: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                  <input
                    type="password"
                    value={profile.newPassword}
                    onChange={(e) => setProfile({ ...profile, newPassword: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={profile.confirmPassword}
                    onChange={(e) => setProfile({ ...profile, confirmPassword: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div className="pt-4">
                  <button type="submit" disabled={saving} className="btn-primary">
                    <Shield size={18} />
                    {saving ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Appearance</h2>
              
              <div className="space-y-6">
                {/* Sidebar Toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Sidebar</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="sidebar" 
                        checked={sidebarOpen}
                        onChange={() => !sidebarOpen && toggleSidebar()}
                        className="text-blue-600" 
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Expanded</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="sidebar" 
                        checked={!sidebarOpen}
                        onChange={() => sidebarOpen && toggleSidebar()}
                        className="text-blue-600" 
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Collapsed</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
