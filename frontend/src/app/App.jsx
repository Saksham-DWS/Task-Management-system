import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { useAuthStore } from '../store/auth.store'

function App() {
  const { user, isAuthenticated } = useAuthStore()
  useEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])

  if (!isAuthenticated) {
    return (
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-50 transition-colors">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            <AppRoutes />
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
