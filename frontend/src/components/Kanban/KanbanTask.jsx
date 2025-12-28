import { Draggable } from '@hello-pangea/dnd'
import TaskCard from '../Cards/TaskCard'

export default function KanbanTask({ task, index, onClick }) {
  return (
    <Draggable draggableId={task._id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={snapshot.isDragging ? 'opacity-75' : ''}
        >
          <TaskCard task={task} onClick={onClick} />
        </div>
      )}
    </Draggable>
  )
}
