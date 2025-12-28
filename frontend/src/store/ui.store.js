import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useUIStore = create(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      darkMode: false,
      activeModal: null,
      modalData: null,
      loading: false,
      notification: null,

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      
      toggleDarkMode: () => {
        const newDarkMode = !get().darkMode
        // Apply dark mode to document
        if (newDarkMode) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        set({ darkMode: newDarkMode })
      },

      setDarkMode: (darkMode) => {
        if (darkMode) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        set({ darkMode })
      },
      
      openModal: (modalName, data = null) => set({
        activeModal: modalName,
        modalData: data
      }),
      
      closeModal: () => set({
        activeModal: null,
        modalData: null
      }),

      setLoading: (loading) => set({ loading }),

      showNotification: (notification) => {
        set({ notification })
        // Auto-clear notification after 5 seconds
        setTimeout(() => {
          set({ notification: null })
        }, 5000)
      },
      
      clearNotification: () => set({ notification: null })
    }),
    {
      name: 'dws-ui-storage',
      partialize: (state) => ({ 
        sidebarOpen: state.sidebarOpen,
        darkMode: state.darkMode 
      }),
      onRehydrateStorage: () => (state) => {
        // Apply dark mode on page load
        if (state?.darkMode) {
          document.documentElement.classList.add('dark')
        }
      }
    }
  )
)
