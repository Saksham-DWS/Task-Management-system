import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'

export default function ManagerRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore()
  const isManager = user?.role === 'manager' || user?.role === 'admin'

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isManager) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
