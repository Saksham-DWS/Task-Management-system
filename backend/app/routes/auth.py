from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordRequestForm
from bson import ObjectId
from datetime import datetime
import re

from ..database import get_users_collection
from ..models import UserCreate, UserResponse, UserLogin, Token
from ..services.auth import (
    get_password_hash, 
    verify_password, 
    create_access_token,
    get_current_user
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=Token)
async def register(user_data: UserCreate):
    users = get_users_collection()
    
    # Check if user exists (case-insensitive)
    existing_user = await users.find_one({"email": re.compile(f"^{re.escape(user_data.email)}$", re.IGNORECASE)})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    user_dict = {
        "name": user_data.name,
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "role": user_data.role.value,
        "access": {"category_ids": [], "project_ids": [], "task_ids": []},
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
    return {
        "_id": current_user["_id"],
        "name": current_user["name"],
        "email": current_user["email"],
        "role": current_user.get("role", "user"),
        "access": current_user.get("access", {"category_ids": [], "project_ids": [], "task_ids": []})
    }
