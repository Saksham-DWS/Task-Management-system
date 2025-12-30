import { Bot, RefreshCw } from 'lucide-react'
import { TASK_STATUS_COLORS, TASK_STATUS_LABELS, AI_HEALTH_COLORS, normalizeTaskStatus } from '../../utils/constants'
import { formatDateTime } from '../../utils/helpers'

const healthLabels = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  needs_attention: 'Needs Attention'
}

const insightStatus = (value) => {
  if (!value) return 'on_track'
  const normalized = String(value).toLowerCase().replace(/\s+/g, '_')
  if (normalized === 'good') return 'on_track'
  if (normalized === 'on-track') return 'on_track'
  return normalized
}

const buildHighlightText = (text, terms) => {
  if (!text) return ''
  let output = text
  terms.forEach((term) => {
    if (!term || term.length < 3) return
    const token = `**${term}**`
    if (output.includes(token)) return
    output = output.split(term).join(token)
  })
  return output
}

const renderWithBold = (text) => {
  if (!text) return null
  const lines = String(text).split('\n')
  return lines.map((line, lineIndex) => {
    const segments = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
    return (
      <span key={`line-${lineIndex}`}>
        {segments.map((segment, index) => {
          if (segment.startsWith('**') && segment.endsWith('**')) {
            const value = segment.slice(2, -2)
            return (
              <strong key={`seg-${lineIndex}-${index}`} className="font-semibold text-primary-700">
                {value}
              </strong>
            )
          }
          return <span key={`seg-${lineIndex}-${index}`}>{segment}</span>
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    )
  })
}

export default function ProjectAIInsights({ insight, loading, onGenerate, tasks = [], projectName: providedProjectName }) {
  const taskMap = new Map(tasks.map((task) => [task._id, task]))
  const generatedAt = insight?.generated_at || insight?.generatedAt
  const nextDue = insight?.next_due_at || insight?.nextDueAt
  const lastAttempt = insight?.last_attempt_at || insight?.lastAttemptAt
  const aiError = insight?.ai_error || insight?.aiError
  const projectName = providedProjectName || insight?.project_name || insight?.projectName || tasks[0]?.project?.name
  const taskNames = tasks.map((task) => task.title).filter(Boolean).slice(0, 4)
  const highlightTerms = [projectName, ...taskNames].filter(Boolean)

  const summary = buildHighlightText(insight?.summary, highlightTerms)
  const recommendation = buildHighlightText(insight?.recommendation, highlightTerms)
  const goalsSummary = buildHighlightText(insight?.goals_summary || insight?.goalsSummary, highlightTerms)
  const citations = insight?.citations || []
  const taskInsights = insight?.task_insights || insight?.taskInsights || []

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="card xl:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bot className="text-primary-600" size={20} />
            <h3 className="font-semibold text-gray-900">AI Project Insights</h3>
          </div>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Generating' : 'Generate'}
          </button>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
          <span>Last generated: {generatedAt ? formatDateTime(generatedAt) : 'Not generated yet'}</span>
          {lastAttempt && <span>Last attempt: {formatDateTime(lastAttempt)}</span>}
          <span>Next auto refresh: {nextDue ? formatDateTime(nextDue) : 'Scheduled'}</span>
          {insight?.source && <span>Source: {insight.source}</span>}
          {aiError && (
            <span className="text-red-500">AI error: {String(aiError).slice(0, 160)}</span>
          )}
        </div>

        {loading && !summary ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <RefreshCw className="animate-spin" size={20} />
          </div>
        ) : summary ? (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {renderWithBold(summary)}
              </p>
            </div>
            {goalsSummary && (
              <div className="p-4 rounded-lg border border-blue-100 bg-blue-50">
                <p className="text-sm text-blue-700">
                  <strong>Goals & Achievements:</strong> {renderWithBold(goalsSummary)}
                </p>
              </div>
            )}
            {recommendation && (
              <div className="p-4 rounded-lg border border-amber-100 bg-amber-50">
                <p className="text-sm text-amber-700">
                  <strong>Recommendation:</strong> {renderWithBold(recommendation)}
                </p>
              </div>
            )}
            {citations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {citations.map((item, index) => (
                  <span
                    key={`${item.label}-${index}`}
                    className="badge badge-info"
                  >
                    {item.label}: {item.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-400">
            No AI insights yet. Click Generate to create one.
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Task Level Insights</h3>
          <span className="text-xs text-gray-500">{taskInsights.length} tasks</span>
        </div>
        <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
          {taskInsights.length > 0 ? (
            taskInsights.map((item) => {
              const task = taskMap.get(item.task_id)
              const status = item.status || task?.status
              const normalizedStatus = status ? normalizeTaskStatus(status) : null
              const health = insightStatus(item.health)
              return (
                <div key={item.task_id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.task_title || task?.title || 'Task'}</p>
                    {normalizedStatus && (
                      <span className={`badge ${TASK_STATUS_COLORS[normalizedStatus] || 'badge-neutral'}`}>
                        {TASK_STATUS_LABELS[normalizedStatus] || normalizedStatus}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <span className={`${AI_HEALTH_COLORS[health] || 'text-gray-500'} font-medium`}>
                      {healthLabels[health] || 'On Track'}
                    </span>
                  </div>
                  {item.insight && (
                    <p className="text-xs text-gray-600 mt-2">{item.insight}</p>
                  )}
                  {item.recommendation && (
                    <p className="text-xs text-gray-500 mt-1">Next: {item.recommendation}</p>
                  )}
                </div>
              )
            })
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">Task insights will appear after generation.</p>
          )}
        </div>
      </div>
    </div>
  )
}
