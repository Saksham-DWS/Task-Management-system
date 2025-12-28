from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class Goal(BaseModel):
    id: int
    text: str
    completed: bool = False


class Achievement(BaseModel):
    id: int
    text: str


class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#6366f1"


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class CategoryInDB(CategoryBase):
    id: str = Field(alias="_id")
    owner_id: str
    weekly_goals: List[Goal] = []
    weekly_achievements: List[Achievement] = []
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    class Config:
        populate_by_name = True


class CategoryResponse(CategoryBase):
    id: str = Field(alias="_id")
    owner_id: str
    weekly_goals: List[Goal] = []
    weekly_achievements: List[Achievement] = []
    project_count: int = 0

    class Config:
        populate_by_name = True
