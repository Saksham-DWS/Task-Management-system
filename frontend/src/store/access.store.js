import { create } from 'zustand'

export const useAccessStore = create((set) => ({
  userAccess: {
    groupIds: [],
    projectIds: [],
    taskIds: []
  },

  setAccess: (accessData) => set({
    userAccess: accessData
  }),

  clearAccess: () => set({
    userAccess: {
      groupIds: [],
      projectIds: [],
      taskIds: []
    }
  })
}))
