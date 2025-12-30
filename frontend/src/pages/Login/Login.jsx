import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const { login, loading, error } = useAuth()
  const navigate = useNavigate()
  const [toastMessage, setToastMessage] = useState('')

  useEffect(() => {
    if (!error) return
    setToastMessage(error)
    const timer = setTimeout(() => setToastMessage(''), 2500)
    return () => clearTimeout(timer)
  }, [error])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await login(formData.email, formData.password)
      navigate('/dashboard')
    } catch (err) {
      // Error is handled by useAuth hook
    }
  }

  return (
    <div className="min-h-screen bg-black flex">
      {toastMessage && (
        <div className="fixed top-6 left-4 right-4 sm:left-auto sm:right-6 z-50">
          <div className="sm:max-w-sm sm:ml-auto bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Particle Background Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 20% 80%, rgba(255,255,255,0.03) 0%, transparent 50%),
                             radial-gradient(circle at 80% 20%, rgba(255,255,255,0.02) 0%, transparent 50%),
                             radial-gradient(circle at 40% 40%, rgba(255,255,255,0.015) 0%, transparent 30%)`
          }}></div>
          {/* Dotted pattern */}
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: `radial-gradient(circle, white 1px, transparent 1px)`,
            backgroundSize: '30px 30px'
          }}></div>
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <h1 className="text-4xl font-light text-white leading-tight">
              Digital Web Solutions
            </h1>
            <h2 className="text-3xl font-light text-white mt-2">
              Group of Companies
            </h2>
            <p className="text-gray-400 mt-6 text-lg italic">
              Together, We Build What's Next
            </p>
          </div>
          
          {/* DWS Logo */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 border-2 border-white rounded-2xl flex items-center justify-center">
              <span className="text-white font-bold text-3xl">DWS</span>
            </div>
            <div>
              <p className="text-white font-semibold">Digital Web Solutions</p>
              <p className="text-gray-400 text-sm">Group of Companies</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white dark:bg-[#0a0a0a]">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-black dark:bg-white rounded-xl mb-4">
              <span className="text-white dark:text-black font-bold text-xl">DWS</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Digital Web Solutions</h1>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2">Sign in to access your projects</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter your password"
                className="input-field"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black dark:bg-white text-white dark:text-black font-semibold py-3 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait...' : 'Sign In'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-2">Demo Credentials:</p>
            <div className="space-y-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Admin:</span> admin@dws.com / admin123
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">User:</span> john@dws.com / password123
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
