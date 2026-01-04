from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


class TaskStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    HOLD = "hold"
    REVIEW = "review"
    COMPLETED = "completed"


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Subtask(BaseModel):
    id: int
    text: str
    completed: bool = False


class Goal(BaseModel):
    id: int
    text: str
    status: str = "pending"  # pending, achieved, not_achieved
    created_at: Optional[datetime] = None
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    achieved_at: Optional[datetime] = None
    achieved_by_id: Optional[str] = None
    achieved_by_name: Optional[str] = None


class Achievement(BaseModel):
    id: int
    text: str
    goal_id: Optional[int] = None  # Link to original goal if applicable
    created_at: Optional[datetime] = None


class Activity(BaseModel):
    description: str
    timestamp: datetime = datetime.utcnow()
    user_id: Optional[str] = None


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.NOT_STARTED
    priority: Priority = Priority.MEDIUM


class TaskCreate(TaskBase):
    project_id: str
    assignee_ids: List[str] = []
    collaborator_ids: List[str] = []
    assigned_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    weekly_goals: Optional[List[Goal]] = []  # Goals set on creation


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[Priority] = None
    assignee_ids: Optional[List[str]] = None
    collaborator_ids: Optional[List[str]] = None
    assigned_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    weekly_goals: Optional[List[Goal]] = None
    weekly_achievements: Optional[List[Achievement]] = None


class TaskInDB(TaskBase):
    id: str = Field(alias="_id")
    project_id: str
    group_id: str
    assigned_by_id: str
    assignee_ids: List[str] = []
    collaborator_ids: List[str] = []
    assigned_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    subtasks: List[Subtask] = []
    weekly_goals: List[Goal] = []
    weekly_achievements: List[Achievement] = []
    goals_created_at: Optional[datetime] = None  # Track when goals were set
    achievements_due_at: Optional[datetime] = None  # 7 days after goals_created_at
    activity: List[Activity] = []
    ai_risk: bool = False
    ai_risk_reason: Optional[str] = None
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    class Config:
        populate_by_name = True


class TaskResponse(TaskBase):
    id: str = Field(alias="_id")
    project_id: str
    group_id: str
    assigned_by_id: str
    assigned_by: Optional[Any] = None
    assignees: List[Any] = []
    collaborators: List[Any] = []
    project: Optional[Any] = None
    group: Optional[Any] = None
    assigned_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    subtasks: List[Subtask] = []
    weekly_goals: List[Goal] = []
    weekly_achievements: List[Achievement] = []
    goals_created_at: Optional[datetime] = None
    achievements_due_at: Optional[datetime] = None
    can_add_achievements: bool = False  # Computed field - true if 7 days passed
    activity: List[Activity] = []
    ai_risk: bool = False
    ai_risk_reason: Optional[str] = None

    class Config:
        populate_by_name = True


class Attachment(BaseModel):
    name: str
    type: str
    data: str


class CommentBase(BaseModel):
    content: str


class CommentCreate(CommentBase):
    attachments: Optional[List[Attachment]] = []
    parent_id: Optional[str] = None


class CommentInDB(CommentBase):
    id: str = Field(alias="_id")
    task_id: str
    user_id: str
    created_at: datetime = datetime.utcnow()
    parent_id: Optional[str] = None

    class Config:
        populate_by_name = True


class CommentResponse(CommentBase):
    id: str = Field(alias="_id")
    task_id: str
    user: Optional[Any] = None
    created_at: datetime
    parent_id: Optional[str] = None

    class Config:
        populate_by_name = True
