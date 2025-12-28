import { Bot, RefreshCw } from 'lucide-react'
import AIInsightCard from './AIInsightCard'

export default function AISummary({ 
  title = 'AI Insights', 
  insights = [], 
  healthScore, 
  loading, 
  onRefresh 
}) {
  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="text-primary-600" size={20} />
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        {onRefresh && (
          <button 
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Health Score */}
      {healthScore !== undefined && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Health Score</span>
            <span className={`text-2xl font-bold ${
              healthScore >= 70 ? 'text-green-600' :
              healthScore >= 40 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {healthScore}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                healthScore >= 70 ? 'bg-green-500' :
                healthScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${healthScore}%` }}
            />
          </div>
        </div>
      )}

      {/* Insights */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="animate-spin text-gray-400" size={24} />
        </div>
      ) : insights.length > 0 ? (
        <div className="space-y-3">
          {insights.map((insight, index) => (
            <AIInsightCard
              key={index}
              type={insight.type}
              title={insight.title}
              message={insight.message}
              action={insight.action}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <Bot size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No insights available</p>
        </div>
      )}
    </div>
  )
}
