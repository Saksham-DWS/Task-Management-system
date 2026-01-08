export const TASK_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  HOLD: 'hold',
  REVIEW: 'review',
  COMPLETED: 'completed'
}

export const TASK_STATUS_ORDER = [
  TASK_STATUS.NOT_STARTED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.HOLD,
  TASK_STATUS.REVIEW,
  TASK_STATUS.COMPLETED
]

export const TASK_STATUS_ALIASES = {
  not_started: TASK_STATUS.NOT_STARTED,
  in_progress: TASK_STATUS.IN_PROGRESS,
  on_hold: TASK_STATUS.HOLD,
  hold: TASK_STATUS.HOLD,
  blocked: TASK_STATUS.HOLD,
  in_review: TASK_STATUS.REVIEW,
  review: TASK_STATUS.REVIEW,
  completed: TASK_STATUS.COMPLETED
}

export const normalizeTaskStatus = (status) => TASK_STATUS_ALIASES[status] || status

export const TASK_STATUS_LABELS = {
  [TASK_STATUS.NOT_STARTED]: 'Pre-Task',
  [TASK_STATUS.IN_PROGRESS]: 'In Progress',
  [TASK_STATUS.HOLD]: 'On Hold',
  [TASK_STATUS.REVIEW]: 'Review',
  [TASK_STATUS.COMPLETED]: 'Completed'
}

export const TASK_STATUS_COLORS = {
  [TASK_STATUS.NOT_STARTED]: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  [TASK_STATUS.IN_PROGRESS]: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  [TASK_STATUS.HOLD]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  [TASK_STATUS.REVIEW]: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  [TASK_STATUS.COMPLETED]: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
}

export const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
}

export const PRIORITY_LABELS = {
  [PRIORITY.LOW]: 'Low',
  [PRIORITY.MEDIUM]: 'Medium',
  [PRIORITY.HIGH]: 'High'
}

export const PRIORITY_COLORS = {
  [PRIORITY.LOW]: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  [PRIORITY.MEDIUM]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  [PRIORITY.HIGH]: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

export const PROJECT_STATUS = {
  ONGOING: 'ongoing',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed'
}

export const PROJECT_STATUS_LABELS = {
  [PROJECT_STATUS.ONGOING]: 'Ongoing',
  [PROJECT_STATUS.ON_HOLD]: 'On Hold',
  [PROJECT_STATUS.COMPLETED]: 'Closed'
}

export const PROJECT_STATUS_COLORS = {
  [PROJECT_STATUS.ONGOING]: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  [PROJECT_STATUS.ON_HOLD]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  [PROJECT_STATUS.COMPLETED]: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
}

export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user'
}

export const ACCESS_LEVELS = {
  GROUP: 'group',
  PROJECT: 'project',
  TASK: 'task'
}

export const AI_HEALTH_STATUS = {
  ON_TRACK: 'on_track',
  AT_RISK: 'at_risk',
  NEEDS_ATTENTION: 'needs_attention'
}

export const AI_HEALTH_COLORS = {
  [AI_HEALTH_STATUS.ON_TRACK]: 'text-emerald-600',
  [AI_HEALTH_STATUS.AT_RISK]: 'text-amber-600',
  [AI_HEALTH_STATUS.NEEDS_ATTENTION]: 'text-red-600'
}

// Goals & Achievements status
export const GOAL_STATUS = {
  PENDING: 'pending',
  ACHIEVED: 'achieved',
  MISSED: 'missed'
}

export const GOAL_STATUS_LABELS = {
  [GOAL_STATUS.PENDING]: 'Pending',
  [GOAL_STATUS.ACHIEVED]: 'Achieved',
  [GOAL_STATUS.MISSED]: 'Missed'
}
