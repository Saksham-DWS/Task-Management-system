import { X } from 'lucide-react'

export default function ReasonModal({
  title,
  label = 'Reason',
  value,
  onChange,
  onClose,
  onConfirm,
  confirmLabel = 'Accept',
  loading = false
}) {
  const trimmed = (value || '').trim()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2 px-6 py-4">
          <label className="text-sm font-medium text-gray-700">{label}</label>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="input-field min-h-[140px] w-full resize-y"
            placeholder="Write the reason..."
          />
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmed)}
            className="btn-primary"
            disabled={!trimmed || loading}
          >
            {loading ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
