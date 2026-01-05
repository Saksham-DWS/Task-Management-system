import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useUIStore = create(
  persist(
    (set) => ({
      sidebarOpen: true,
      activeModal: null,
      modalData: null,
      loading: false,
      notification: null,

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      
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
        sidebarOpen: state.sidebarOpen
      })
    }
  )
)
