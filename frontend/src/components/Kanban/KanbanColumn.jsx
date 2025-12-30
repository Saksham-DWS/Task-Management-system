import { Droppable, Draggable } from '@hello-pangea/dnd'
import TaskCard from '../Cards/TaskCard'
import { TASK_STATUS_LABELS } from '../../utils/constants'

const columnColors = {
  not_started: 'border-gray-400 dark:border-gray-600',
  in_progress: 'border-blue-400',
  hold: 'border-amber-400',
  review: 'border-indigo-400',
  completed: 'border-emerald-400'
}

const headerColors = {
  not_started: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  review: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
}

export default function KanbanColumn({ status, tasks, onTaskClick }) {
  const label = TASK_STATUS_LABELS[status] || status
  const borderColor = columnColors[status] || 'border-gray-300'
  const headerColor = headerColors[status] || 'bg-gray-100 text-gray-700'

  return (
    <div className={`flex flex-col w-80 flex-shrink-0 bg-gray-50 dark:bg-[#111111] rounded-xl border-t-4 ${borderColor}`}>
      {/* Column Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${headerColor}`}>
            {label}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Droppable Area */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-3 space-y-3 overflow-y-auto min-h-[300px] transition-colors ${
              snapshot.isDraggingOver ? 'bg-blue-50 dark:bg-blue-900/10' : ''
            }`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task._id} draggableId={task._id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`transition-transform ${snapshot.isDragging ? 'rotate-2 scale-105' : ''}`}
                  >
                    <TaskCard task={task} onClick={onTaskClick} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            
            {/* Empty state */}
            {tasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-sm">No tasks</p>
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}
