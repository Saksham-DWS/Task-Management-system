import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

export default function FilterMultiSelect({
  label,
  items = [],
  selectedIds = [],
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyLabel = 'No items found'
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

  const filteredItems = items.filter((item) => {
    const labelText = item.label?.toLowerCase() || ''
    const metaText = item.meta?.toLowerCase() || ''
    const query = search.toLowerCase()
    return labelText.includes(query) || metaText.includes(query)
  })

  const toggleItem = (itemId, disabled) => {
    if (disabled) return
    if (selectedIds.includes(itemId)) {
      onChange(selectedIds.filter((id) => id !== itemId))
    } else {
      onChange([...selectedIds, itemId])
    }
  }

  const selectedItems = items.filter((item) => selectedIds.includes(item.id))

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="input-field cursor-pointer flex items-center justify-between min-h-[42px]"
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedItems.length > 0 ? (
            selectedItems.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs"
              >
                {item.label}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleItem(item.id)
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
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto overscroll-contain">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id, item.disabled)}
                  className={`flex items-center gap-3 px-3 py-2 ${
                    item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                    {item.meta && <p className="text-xs text-gray-500 truncate">{item.meta}</p>}
                  </div>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-gray-100 text-gray-600">
                      {item.badge}
                    </span>
                  )}
                  {selectedIds.includes(item.id) && <Check size={16} className="text-primary-600" />}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">{emptyLabel}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
