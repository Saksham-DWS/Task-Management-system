from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


class GoalStatus(str, Enum):
    PENDING = "pending"
    ACHIEVED = "achieved"
    REJECTED = "rejected"


class GoalPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class GoalActivity(BaseModel):
    description: str
    timestamp: datetime = datetime.utcnow()
    user_id: Optional[str] = None
    user: Optional[str] = None


class GoalBase(BaseModel):
    title: str
    description: Optional[str] = None
    target_month: str
    priority: GoalPriority = GoalPriority.MEDIUM


class GoalCreate(BaseModel):
    assigned_to: str
    title: str
    description: Optional[str] = None
    target_date: Optional[str] = None
    target_month: Optional[str] = None
    priority: GoalPriority = GoalPriority.MEDIUM


class GoalStatusUpdate(BaseModel):
    status: GoalStatus
    comment: Optional[str] = None


class GoalCommentCreate(BaseModel):
    comment: str
    comment_type: Optional[str] = None


class GoalInDB(GoalBase):
    id: str = Field(alias="_id")
    assigned_to: str
    assigned_by: str
    target_date: Optional[datetime] = None
    status: GoalStatus = GoalStatus.PENDING
    assigned_at: datetime = datetime.utcnow()
    achieved_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    user_comment: Optional[str] = None
    manager_comment: Optional[str] = None
    rejection_reason: Optional[str] = None
    activity: List[GoalActivity] = []
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    class Config:
        populate_by_name = True


class GoalResponse(GoalBase):
    id: str = Field(alias="_id")
    assigned_to: str
    assigned_by: str
    target_date: Optional[datetime] = None
    assigned_to_user: Optional[Any] = None
    assigned_by_user: Optional[Any] = None
    status: GoalStatus = GoalStatus.PENDING
    assigned_at: Optional[datetime] = None
    achieved_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    user_comment: Optional[str] = None
    manager_comment: Optional[str] = None
    rejection_reason: Optional[str] = None
    activity: List[GoalActivity] = []

    class Config:
        populate_by_name = True
