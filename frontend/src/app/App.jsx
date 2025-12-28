import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { useAuthStore } from '../store/auth.store'
import { useUIStore } from '../store/ui.store'

function App() {
  const { user, isAuthenticated } = useAuthStore()
  const { darkMode } = useUIStore()

  // Apply dark mode class on mount and changes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  if (!isAuthenticated) {
    return (
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-50 dark:bg-[#0a0a0a] transition-colors">
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
