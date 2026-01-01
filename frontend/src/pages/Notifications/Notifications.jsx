import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, Trash2, XCircle } from 'lucide-react'
import { notificationService } from '../../services/notification.service'
import { getRelativeTime } from '../../utils/helpers'

const TAB_CONFIG = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Marked Unread' },
  { id: 'read', label: 'Marked Read' }
]

const DEFAULT_EMPTY_MESSAGE = {
  all: 'No notifications yet.',
  unread: 'No marked unread notifications.',
  read: 'No marked read notifications.'
}

const toId = (note) => note?._id || note?.id

const formatType = (type) => {
  if (!type) return 'Notification'
  return type.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)

  const loadNotifications = async () => {
    try {
      setLoading(true)
      const data = await notificationService.getAll()
      setNotifications(data)
    } catch (error) {
      console.error('Failed to load notifications', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  const counts = useMemo(() => ({
    all: notifications.length,
    unread: notifications.filter((note) => !note.read).length,
    read: notifications.filter((note) => note.read).length
  }), [notifications])

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter((note) => !note.read)
    }
    if (activeTab === 'read') {
      return notifications.filter((note) => note.read)
    }
    return notifications
  }, [notifications, activeTab])

  const handleMarkRead = async (id) => {
    try {
      await notificationService.markRead(id)
      setNotifications((prev) => prev.map((note) => (toId(note) === id ? { ...note, read: true } : note)))
    } catch (error) {
      console.error('Failed to mark notification read', error)
    }
  }

  const handleMarkUnread = async (id) => {
    try {
      await notificationService.markUnread(id)
      setNotifications((prev) => prev.map((note) => (toId(note) === id ? { ...note, read: false } : note)))
    } catch (error) {
      console.error('Failed to mark notification unread', error)
    }
  }

  const handleDelete = async (id) => {
    try {
      await notificationService.remove(id)
      setNotifications((prev) => prev.filter((note) => toId(note) !== id))
    } catch (error) {
      console.error('Failed to delete notification', error)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead()
      setNotifications((prev) => prev.map((note) => ({ ...note, read: true })))
    } catch (error) {
      console.error('Failed to mark all notifications read', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Stay updated on assignments, comments, and weekly digests.
          </p>
        </div>
        <button
          onClick={handleMarkAllRead}
          className="btn-secondary flex items-center gap-2"
          disabled={counts.unread === 0}
        >
          <CheckCircle2 size={18} />
          Mark All as Read
        </button>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-4">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {tab.label} ({counts[tab.id]})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredNotifications.length === 0 && (
              <div className="py-16 text-center">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto mb-3">
                  <Bell className="text-gray-400" size={22} />
                </div>
                <p className="text-gray-500 dark:text-gray-400">{DEFAULT_EMPTY_MESSAGE[activeTab]}</p>
              </div>
            )}
            {filteredNotifications.map((note) => {
              const noteId = toId(note)
              const isRead = note.read
              return (
                <div
                  key={noteId}
                  className={`flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
                    isRead ? 'bg-white dark:bg-[#0f0f0f]' : 'bg-blue-50 dark:bg-blue-900/20'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
                        {formatType(note.type)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isRead ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' : 'bg-blue-600 text-white'}`}>
                        {isRead ? 'Read' : 'Unread'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 dark:text-white">{note.message}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {getRelativeTime(note.created_at || note.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleMarkRead(noteId)}
                      disabled={isRead}
                      className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
                      title="Mark as read"
                    >
                      <CheckCircle2 size={18} />
                    </button>
                    <button
                      onClick={() => handleMarkUnread(noteId)}
                      disabled={!isRead}
                      className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
                      title="Mark as unread"
                    >
                      <XCircle size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(noteId)}
                      className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      title="Delete notification"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
