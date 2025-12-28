from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


class ProjectStatus(str, Enum):
    ONGOING = "ongoing"
    HOLD = "hold"
    COMPLETED = "completed"


class Goal(BaseModel):
    id: int
    text: str
    completed: bool = False


class Achievement(BaseModel):
    id: int
    text: str


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.ONGOING
    start_date: Optional[datetime] = Field(default=None, alias="startDate")
    end_date: Optional[datetime] = Field(default=None, alias="endDate")

    class Config:
        populate_by_name = True


class ProjectCreate(ProjectBase):
    category_id: str


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    start_date: Optional[datetime] = Field(default=None, alias="startDate")
    end_date: Optional[datetime] = Field(default=None, alias="endDate")

    class Config:
        populate_by_name = True


class ProjectInDB(ProjectBase):
    id: str = Field(alias="_id")
    category_id: str
    owner_id: str
    collaborator_ids: List[str] = []
    weekly_goals: List[Goal] = []
    weekly_achievements: List[Achievement] = []
    health_score: int = 0
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    class Config:
        populate_by_name = True


class ProjectResponse(ProjectBase):
    id: str = Field(alias="_id")
    category_id: str
    owner_id: str
    owner: Optional[Any] = None
    collaborators: List[Any] = []
    weekly_goals: List[Goal] = []
    weekly_achievements: List[Achievement] = []
    health_score: int = 0
    task_count: int = 0

    class Config:
        populate_by_name = True
