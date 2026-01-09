from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime
import re

from ..database import get_users_collection
from ..models import UserCreate, UserLogin, Token, NotificationPreferences
from ..services.auth import (
    get_password_hash, 
    verify_password, 
    create_access_token,
    get_current_user,
    require_role
)
from ..services.notifications import merge_preferences

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=Token)
async def register(
    user_data: UserCreate,
    _current_user: dict = Depends(require_role(["admin"]))
):
    users = get_users_collection()
    
    # Check if user exists (case-insensitive)
    existing_user = await users.find_one({"email": re.compile(f"^{re.escape(user_data.email)}$", re.IGNORECASE)})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    if len(user_data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters"
        )

    # Create user
    if user_data.role.value == "super_admin" and _current_user.get("role") != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to create super admin users"
        )

    user_dict = {
        "name": user_data.name,
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "role": user_data.role.value,
        "status": "active",
        "access": {"group_ids": [], "project_ids": [], "task_ids": []},
        "notification_preferences": NotificationPreferences().model_dump(),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    # Create token
    access_token = create_access_token(data={"sub": user_id})
    return Token(access_token=access_token)


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    users = get_users_collection()
    
    # Case-insensitive email lookup
    user = await users.find_one({"email": re.compile(f"^{re.escape(form_data.username)}$", re.IGNORECASE)})
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": str(user["_id"])})
    return Token(access_token=access_token)


@router.post("/login/json", response_model=Token)
async def login_json(login_data: UserLogin):
    users = get_users_collection()
    
    # Case-insensitive email lookup
    user = await users.find_one({"email": re.compile(f"^{re.escape(login_data.email)}$", re.IGNORECASE)})
    if not user or not verify_password(login_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    access_token = create_access_token(data={"sub": str(user["_id"])})
    return Token(access_token=access_token)


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    preferences = merge_preferences(current_user.get("notification_preferences"))
    return {
        "_id": current_user["_id"],
        "name": current_user["name"],
        "email": current_user["email"],
        "role": current_user.get("role", "user"),
        "access": current_user.get("access", {"group_ids": [], "project_ids": [], "task_ids": []}),
        "notification_preferences": preferences
    }
