import { useState, useCallback } from 'react'
import { aiService } from '../services/ai.service'

export const useAI = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const getProjectInsights = useCallback(async (projectId) => {
    setLoading(true)
    setError(null)
    try {
      const data = await aiService.getProjectInsights(projectId)
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const getCategoryInsights = useCallback(async (categoryId) => {
    setLoading(true)
    setError(null)
    try {
      const data = await aiService.getCategoryInsights(categoryId)
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const getTaskInsights = useCallback(async (taskId) => {
    setLoading(true)
    setError(null)
    try {
      const data = await aiService.getTaskInsights(taskId)
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const getGoalsAnalysis = useCallback(async (projectId) => {
    setLoading(true)
    setError(null)
    try {
      const data = await aiService.getGoalsVsAchievements(projectId)
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const getHealthScore = useCallback(async (projectId) => {
    setLoading(true)
    setError(null)
    try {
      const data = await aiService.getHealthScore(projectId)
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const getTaskPrioritization = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await aiService.getTaskPrioritization()
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    getProjectInsights,
    getCategoryInsights,
    getTaskInsights,
    getGoalsAnalysis,
    getHealthScore,
    getTaskPrioritization
  }
}
