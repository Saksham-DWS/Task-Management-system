import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

// Pages
import Login from '../pages/Login/Login'
import Dashboard from '../pages/Dashboard/Dashboard'
import Categories from '../pages/Categories/Categories'
import CategoryDetail from '../pages/CategoryDetail/CategoryDetail'
import ProjectDetail from '../pages/ProjectDetail/ProjectDetail'
import TaskDetail from '../pages/TaskDetail/TaskDetail'
import Projects from '../pages/Projects/Projects'
import MyWork from '../pages/MyWork/MyWork'
import TeamsAccess from '../pages/TeamsAccess/TeamsAccess'
import Insights from '../pages/Insights/Insights'
import Reports from '../pages/Reports/Reports'
import Settings from '../pages/Settings/Settings'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
      <Route path="/categories/:id" element={<ProtectedRoute><CategoryDetail /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
      <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
      <Route path="/tasks/:id" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
      <Route path="/my-work" element={<ProtectedRoute><MyWork /></ProtectedRoute>} />
      <Route path="/teams" element={<ProtectedRoute><TeamsAccess /></ProtectedRoute>} />
      <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
