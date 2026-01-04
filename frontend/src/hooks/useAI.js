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

  const getGroupInsights = useCallback(async (groupId) => {
    setLoading(true)
    setError(null)
    try {
      const data = await aiService.getGroupInsights(groupId)
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
    getGroupInsights,
    getTaskInsights,
    getGoalsAnalysis,
    getHealthScore,
    getTaskPrioritization
  }
}
