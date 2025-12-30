import { useState, useEffect } from 'react'
import { Bot, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, BarChart3, RefreshCw } from 'lucide-react'
import { aiService } from '../../services/ai.service'
import { categoryService } from '../../services/category.service'
import { projectService } from '../../services/project.service'
import { formatDateTime } from '../../utils/helpers'

export default function Insights() {
  const [loading, setLoading] = useState(true)
  const [adminInsight, setAdminInsight] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [categories, setCategories] = useState([])
  const [projects, setProjects] = useState([])
  const [stats, setStats] = useState({
    totalProjects: 0,
    onTrack: 0,
    atRisk: 0,
    needsAttention: 0
  })

  const splitParagraphs = (text) =>
    (text || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)

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

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [categoriesData, projectsData, insightsData] = await Promise.all([
        categoryService.getAll(),
        projectService.getAll(),
        aiService.getOverallInsights()
      ])
      
      setCategories(categoriesData)
      setProjects(projectsData)
      setAdminInsight(insightsData?.insight || null)
      
      // Calculate stats
      const onTrack = projectsData.filter(p => p.healthScore >= 70).length
      const atRisk = projectsData.filter(p => p.healthScore >= 40 && p.healthScore < 70).length
      const needsAttention = projectsData.filter(p => p.healthScore < 40).length
      
      setStats({
        totalProjects: projectsData.length,
        onTrack,
        atRisk,
        needsAttention
      })
    } catch (error) {
      console.error('Failed to load insights:', error)
      setAdminInsight(null)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateAdminInsights = async () => {
    setRefreshing(true)
    try {
      const data = await aiService.generateAdminInsights()
      setAdminInsight(data?.insight || null)
    } catch (error) {
      console.error('Failed to generate admin insights:', error)
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const highlightTerms = [
    ...categories.map((item) => item.name).filter(Boolean).slice(0, 8),
    ...projects.map((item) => item.name).filter(Boolean).slice(0, 8)
  ]

  const analysisText = buildHighlightText(adminInsight?.analysis, highlightTerms)
  const recommendationText = buildHighlightText(adminInsight?.recommendations, highlightTerms)
  const analysisParagraphs = splitParagraphs(analysisText)
  const recommendationParagraphs = splitParagraphs(recommendationText)
  const focusArea = adminInsight?.focus_area || adminInsight?.focusArea
  const teamBalance = adminInsight?.team_balance || adminInsight?.teamBalance
  const quickWin = adminInsight?.quick_win || adminInsight?.quickWin
  const categorySummaries = adminInsight?.category_summaries || adminInsight?.categorySummaries || []
  const projectSummaries = adminInsight?.project_summaries || adminInsight?.projectSummaries || []
  const generatedAt = adminInsight?.generated_at || adminInsight?.generatedAt
  const nextDueAt = adminInsight?.next_due_at || adminInsight?.nextDueAt
  const lastAttemptAt = adminInsight?.last_attempt_at || adminInsight?.lastAttemptAt
  const aiError = adminInsight?.ai_error || adminInsight?.aiError

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
        <p className="text-gray-500 mt-1">AI-powered analysis of your projects and tasks</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="text-primary-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalProjects}</p>
              <p className="text-sm text-gray-500">Total Projects</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.onTrack}</p>
              <p className="text-sm text-gray-500">On Track</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-yellow-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.atRisk}</p>
              <p className="text-sm text-gray-500">At Risk</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.needsAttention}</p>
              <p className="text-sm text-gray-500">Needs Attention</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bot className="text-primary-600" size={20} />
              <h2 className="font-semibold text-gray-900">AI Analysis</h2>
            </div>
            <button
              onClick={handleGenerateAdminInsights}
              disabled={refreshing}
              className="btn-secondary flex items-center gap-2"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
            <span>Last generated: {generatedAt ? formatDateTime(generatedAt) : 'Not generated yet'}</span>
            {lastAttemptAt && <span>Last attempt: {formatDateTime(lastAttemptAt)}</span>}
            <span>Next auto refresh: {nextDueAt ? formatDateTime(nextDueAt) : 'Scheduled'}</span>
            {adminInsight?.source && <span>Source: {adminInsight.source}</span>}
            {aiError && <span className="text-red-500">AI error: {String(aiError).slice(0, 160)}</span>}
          </div>
          {analysisParagraphs.length > 0 ? (
            <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
              {analysisParagraphs.map((paragraph, index) => (
                <p key={`analysis-${index}`}>{renderWithBold(paragraph)}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No AI analysis yet. Click Refresh to generate.</p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="text-purple-600" size={20} />
            <h2 className="font-semibold text-gray-900">AI Recommendations</h2>
          </div>
          <div className="space-y-3">
            {focusArea && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-purple-700">
                  <strong>Focus Area:</strong> {renderWithBold(buildHighlightText(focusArea, highlightTerms))}
                </p>
              </div>
            )}
            {teamBalance && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>Team Balance:</strong> {renderWithBold(buildHighlightText(teamBalance, highlightTerms))}
                </p>
              </div>
            )}
            {quickWin && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">
                  <strong>Quick Win:</strong> {renderWithBold(buildHighlightText(quickWin, highlightTerms))}
                </p>
              </div>
            )}
          </div>
          {recommendationParagraphs.length > 0 && (
            <div className="mt-4 space-y-3 text-sm text-gray-700 leading-relaxed">
              {recommendationParagraphs.map((paragraph, index) => (
                <p key={`rec-${index}`}>{renderWithBold(paragraph)}</p>
              ))}
            </div>
          )}
          {!recommendationParagraphs.length && !focusArea && !teamBalance && !quickWin && (
            <p className="text-sm text-gray-400 text-center py-6">No AI recommendations yet. Click Refresh to generate.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="text-green-600" size={20} />
            <h2 className="font-semibold text-gray-900">Project Health</h2>
          </div>
          <div className="space-y-4">
            {projects.slice(0, 5).map(project => {
              const healthScore = project.healthScore || Math.floor(Math.random() * 100)
              return (
                <div key={project._id} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{project.name}</p>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full rounded-full ${
                          healthScore >= 70 ? 'bg-green-500' :
                          healthScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${healthScore}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${
                    healthScore >= 70 ? 'text-green-600' :
                    healthScore >= 40 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {healthScore}%
                  </span>
                </div>
              )
            })}
            {projects.length === 0 && (
              <p className="text-gray-400 text-center py-4">No projects to analyze</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-blue-600" size={20} />
            <h2 className="font-semibold text-gray-900">Category Performance</h2>
          </div>
          <div className="space-y-4">
            {categories.map(category => {
              const categoryProjects = projects.filter(p => p.categoryId === category._id)
              const avgHealth = categoryProjects.length > 0
                ? Math.round(categoryProjects.reduce((sum, p) => sum + (p.healthScore || 50), 0) / categoryProjects.length)
                : 0
              return (
                <div key={category._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{category.name}</p>
                    <p className="text-sm text-gray-500">{categoryProjects.length} projects</p>
                  </div>
                  <div className={`text-lg font-bold ${
                    avgHealth >= 70 ? 'text-green-600' :
                    avgHealth >= 40 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {avgHealth}%
                  </div>
                </div>
              )
            })}
            {categories.length === 0 && (
              <p className="text-gray-400 text-center py-4">No categories to analyze</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-blue-600" size={20} />
            <h2 className="font-semibold text-gray-900">Category Insights</h2>
          </div>
          <div className="space-y-3">
            {categorySummaries.length > 0 ? (
              categorySummaries.map((item, index) => (
                <div key={item.category_id || index} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{item.name || 'Category'}</p>
                  <p className="text-sm text-gray-600 mt-1">{item.insight}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-center py-4">No category insights yet.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="text-green-600" size={20} />
            <h2 className="font-semibold text-gray-900">Project Insights</h2>
          </div>
          <div className="space-y-3">
            {projectSummaries.length > 0 ? (
              projectSummaries.map((item, index) => (
                <div key={item.project_id || index} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{item.name || 'Project'}</p>
                  <p className="text-sm text-gray-600 mt-1">{item.insight}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-center py-4">No project insights yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
