import { Lightbulb, AlertTriangle, TrendingUp, TrendingDown, CheckCircle } from 'lucide-react'

const iconMap = {
  insight: Lightbulb,
  warning: AlertTriangle,
  positive: TrendingUp,
  negative: TrendingDown,
  success: CheckCircle
}

const colorMap = {
  insight: 'bg-blue-50 border-blue-200 text-blue-700',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  positive: 'bg-green-50 border-green-200 text-green-700',
  negative: 'bg-red-50 border-red-200 text-red-700',
  success: 'bg-green-50 border-green-200 text-green-700'
}

const iconColorMap = {
  insight: 'text-blue-500',
  warning: 'text-yellow-500',
  positive: 'text-green-500',
  negative: 'text-red-500',
  success: 'text-green-500'
}

export default function AIInsightCard({ type = 'insight', title, message, action }) {
  const Icon = iconMap[type] || Lightbulb
  const colorClass = colorMap[type] || colorMap.insight
  const iconColor = iconColorMap[type] || iconColorMap.insight

  return (
    <div className={`p-4 rounded-lg border ${colorClass}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${iconColor}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1">
          {title && (
            <h4 className="font-medium mb-1">{title}</h4>
          )}
          <p className="text-sm opacity-90">{message}</p>
          {action && (
            <button className="mt-2 text-sm font-medium underline hover:no-underline">
              {action}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
