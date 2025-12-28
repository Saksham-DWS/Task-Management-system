import { create } from 'zustand'

export const useAccessStore = create((set) => ({
  userAccess: {
    categoryIds: [],
    projectIds: [],
    taskIds: []
  },

  setAccess: (accessData) => set({
    userAccess: accessData
  }),

  clearAccess: () => set({
    userAccess: {
      categoryIds: [],
      projectIds: [],
      taskIds: []
    }
  })
}))
