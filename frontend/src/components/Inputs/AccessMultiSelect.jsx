import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { getAvatarColor, getInitials } from '../../utils/helpers'

export default function AccessMultiSelect({
  users = [],
  selectedIds = [],
  onChange,
  label = 'Access',
  maxSelections = Infinity,
  placeholder = 'Search users...'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredUsers = users.filter((user) => {
    const name = user.name?.toLowerCase() || ''
    const email = user.email?.toLowerCase() || ''
    const query = search.toLowerCase()
    return name.includes(query) || email.includes(query)
  })

  const toggleUser = (userId) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId))
    } else {
      if (maxSelections === 1) {
        onChange([userId])
      } else {
        onChange([...selectedIds, userId])
      }
    }
  }

  const getUserId = (user) => String(user?._id || user?.id || '')
  const selectedUsers = users.filter((user) => selectedIds.includes(getUserId(user)))

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="input-field cursor-pointer flex items-center justify-between min-h-[42px]"
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedUsers.length > 0 ? (
            selectedUsers.map((user) => (
              <span
                key={getUserId(user)}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs"
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] ${getAvatarColor(user.name)}`}>
                  {getInitials(user.name)}
                </span>
                {user.name}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleUser(getUserId(user))
                  }}
                  className="hover:text-primary-900"
                >
                  <X size={12} />
                </button>
              </span>
            ))
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={18} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-200 bg-white">
            <div className="relative">
              <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={placeholder}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          </div>

          <div className="max-h-32 overflow-y-auto overscroll-contain">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <div
                  key={getUserId(user)}
                  onClick={() => toggleUser(getUserId(user))}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${getAvatarColor(user.name)}`}>
                    {getInitials(user.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  {selectedIds.includes(getUserId(user)) && (
                    <Check size={16} className="text-primary-600" />
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No users found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
