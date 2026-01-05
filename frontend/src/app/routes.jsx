import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

// Pages
import Login from '../pages/Login/Login'
import Dashboard from '../pages/Dashboard/Dashboard'
import Groups from '../pages/Groups/Groups'
import GroupDetail from '../pages/GroupDetail/GroupDetail'
import ProjectDetail from '../pages/ProjectDetail/ProjectDetail'
import TaskDetail from '../pages/TaskDetail/TaskDetail'
import Projects from '../pages/Projects/Projects'
import MyWork from '../pages/MyWork/MyWork'
import TeamsAccess from '../pages/TeamsAccess/TeamsAccess'
import Insights from '../pages/Insights/Insights'
import Reports from '../pages/Reports/Reports'
import Settings from '../pages/Settings/Settings'
import Notifications from '../pages/Notifications/Notifications'
import ManagerRoute from './ManagerRoute'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
      <Route path="/groups/:id" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
      <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
      <Route path="/tasks/:id" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
      <Route path="/my-work" element={<ProtectedRoute><MyWork /></ProtectedRoute>} />
      <Route path="/teams" element={<ProtectedRoute><TeamsAccess /></ProtectedRoute>} />
      <Route path="/insights" element={<ManagerRoute><Insights /></ManagerRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
