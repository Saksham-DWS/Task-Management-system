from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class NotificationBase(BaseModel):
    user_id: str
    message: str
    type: str = "task_status"
    task_id: Optional[str] = None
    project_id: Optional[str] = None
    status: Optional[str] = None
    actor: Optional[Any] = None


class NotificationCreate(NotificationBase):
    read: bool = False
    created_at: datetime = datetime.utcnow()


class NotificationInDB(NotificationBase):
    id: str = Field(alias="_id")
    read: bool = False
    created_at: datetime = datetime.utcnow()

    class Config:
        populate_by_name = True


class NotificationResponse(NotificationBase):
    id: str = Field(alias="_id")
    read: bool = False
    created_at: datetime

    class Config:
        populate_by_name = True
