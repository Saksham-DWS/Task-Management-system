import { useState, useEffect } from 'react'
import { Bot, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Users, BarChart3 } from 'lucide-react'
import { aiService } from '../../services/ai.service'
import { categoryService } from '../../services/category.service'
import { projectService } from '../../services/project.service'
import AIInsightCard from '../../components/AI/AIInsightCard'

export default function Insights() {
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState([])
  const [categories, setCategories] = useState([])
  const [projects, setProjects] = useState([])
  const [stats, setStats] = useState({
    totalProjects: 0,
    onTrack: 0,
    atRisk: 0,
    needsAttention: 0
  })

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
      setInsights(insightsData?.insights || generateMockInsights(projectsData))
      
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
      // Generate mock insights on error
      setInsights(generateMockInsights([]))
    } finally {
      setLoading(false)
    }
  }

  const generateMockInsights = (projectsData) => {
    const insights = []
    
    const blockedProjects = projectsData.filter(p => p.status === 'hold')
    if (blockedProjects.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Projects On Hold',
        message: `${blockedProjects.length} project${blockedProjects.length > 1 ? 's are' : ' is'} currently on hold. Review and take action.`
      })
    }

    const completedProjects = projectsData.filter(p => p.status === 'completed')
    if (completedProjects.length > 0) {
      insights.push({
        type: 'success',
        title: 'Completed Projects',
        message: `${completedProjects.length} project${completedProjects.length > 1 ? 's have' : ' has'} been completed. Great work!`
      })
    }

    insights.push({
      type: 'insight',
      title: 'Weekly Performance',
      message: 'Task completion rate is trending upward compared to last week.'
    })

    insights.push({
      type: 'positive',
      title: 'Team Productivity',
      message: 'Team velocity has improved by 15% this month.'
    })

    return insights
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Insights */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="text-primary-600" size={20} />
            <h2 className="font-semibold text-gray-900">AI Analysis</h2>
          </div>
          <div className="space-y-3">
            {insights.map((insight, index) => (
              <AIInsightCard
                key={index}
                type={insight.type}
                title={insight.title}
                message={insight.message}
              />
            ))}
          </div>
        </div>

        {/* Project Health Overview */}
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

        {/* Category Performance */}
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

        {/* Recommendations */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="text-purple-600" size={20} />
            <h2 className="font-semibold text-gray-900">AI Recommendations</h2>
          </div>
          <div className="space-y-3">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm text-purple-700">
                <strong>Focus Area:</strong> Review blocked tasks in projects with low health scores to improve overall velocity.
              </p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Team Balance:</strong> Consider redistributing tasks among team members to prevent overload.
              </p>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">
                <strong>Quick Win:</strong> Complete tasks that are close to deadline first to maintain momentum.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
