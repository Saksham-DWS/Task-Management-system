from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class AccessControl(BaseModel):
    category_ids: List[str] = []
    project_ids: List[str] = []
    task_ids: List[str] = []


class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserCreate(UserBase):
    password: str
    role: UserRole = UserRole.USER


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None


class UserInDB(UserBase):
    id: str = Field(alias="_id")
    role: UserRole = UserRole.USER
    status: UserStatus = UserStatus.ACTIVE
    access: AccessControl = AccessControl()
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    class Config:
        populate_by_name = True


class UserResponse(UserBase):
    id: str = Field(alias="_id")
    role: UserRole
    status: UserStatus = UserStatus.ACTIVE
    access: AccessControl

    class Config:
        populate_by_name = True


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None
