from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
import re

from ..database import get_users_collection
from ..models import UserCreate, UserUpdate, NotificationPreferences
from ..services.auth import get_current_user, require_role, get_password_hash

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("")
async def get_users(current_user: dict = Depends(get_current_user)):
    users = get_users_collection()
    cursor = users.find({}, {"password": 0})
    result = []
    async for user in cursor:
        user["_id"] = str(user["_id"])
        result.append(user)
    return result


@router.get("/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    users = get_users_collection()
    user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    return user


@router.post("")
async def create_user(
    user_data: UserCreate,
    current_user: dict = Depends(require_role(["admin"]))
):
    users = get_users_collection()
    
    # Case-insensitive email check
    existing = await users.find_one({"email": re.compile(f"^{re.escape(user_data.email)}$", re.IGNORECASE)})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    if len(user_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user_dict = {
        "name": user_data.name,
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "role": user_data.role.value,
        "status": "active",
        "access": {"category_ids": [], "project_ids": [], "task_ids": []},
        "notification_preferences": NotificationPreferences().model_dump(),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await users.insert_one(user_dict)
    user_dict["_id"] = str(result.inserted_id)
    del user_dict["password"]
    return user_dict


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: dict = Depends(get_current_user)
):
    users = get_users_collection()
    
    # Check permissions
    if current_user["_id"] != user_id and current_user.get("role") not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {k: v for k, v in user_data.dict().items() if v is not None}
    if "role" in update_data:
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not authorized to change role")
        update_data.pop("role")

    if "email" in update_data:
        existing = await users.find_one({
            "email": re.compile(f"^{re.escape(update_data['email'])}$", re.IGNORECASE),
            "_id": {"$ne": ObjectId(user_id)}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")

    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.utcnow()
    
    result = await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    user["_id"] = str(user["_id"])
    return user


@router.put("/{user_id}/role")
async def update_user_role(
    user_id: str,
    role_data: dict,
    current_user: dict = Depends(require_role(["admin"]))
):
    users = get_users_collection()
    
    new_role = role_data.get("role")
    if new_role not in ["admin", "manager", "user"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    result = await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"role": new_role, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    user["_id"] = str(user["_id"])
    return user


@router.post("/access/{user_id}/category")
async def grant_category_access(
    user_id: str,
    data: dict,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    users = get_users_collection()
    item_id = data.get("itemId")
    
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$addToSet": {"access.category_ids": item_id}}
    )
    
    user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    user["_id"] = str(user["_id"])
    return user


@router.delete("/access/{user_id}/category/{item_id}")
async def revoke_category_access(
    user_id: str,
    item_id: str,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    users = get_users_collection()
    
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$pull": {"access.category_ids": item_id}}
    )
    
    user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    user["_id"] = str(user["_id"])
    return user


@router.post("/access/{user_id}/project")
async def grant_project_access(
    user_id: str,
    data: dict,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    users = get_users_collection()
    item_id = data.get("itemId")
    
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$addToSet": {"access.project_ids": item_id}}
    )
    
    user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    user["_id"] = str(user["_id"])
    return user


@router.delete("/access/{user_id}/project/{item_id}")
async def revoke_project_access(
    user_id: str,
    item_id: str,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    users = get_users_collection()
    
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$pull": {"access.project_ids": item_id}}
    )
    
    user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    user["_id"] = str(user["_id"])
    return user


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_role(["admin"]))
):
    """Delete a user (admin only). Cannot delete yourself."""
    users = get_users_collection()
    
    if current_user["_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    # Check if user exists
    user = await users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Don't allow deleting the last admin
    if user.get("role") == "admin":
        admin_count = await users.count_documents({"role": "admin"})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    
    await users.delete_one({"_id": ObjectId(user_id)})
    return {"message": "User deleted successfully"}


@router.put("/{user_id}/password")
async def change_user_password(
    user_id: str,
    password_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Change user password. Users can change their own, admins can change anyone's."""
    users = get_users_collection()
    
    # Check permissions
    if current_user["_id"] != user_id and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    new_password = password_data.get("new_password")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # If user is changing their own password, verify current password
    if current_user["_id"] == user_id:
        from ..services.auth import verify_password
        current_password = password_data.get("current_password")
        user = await users.find_one({"_id": ObjectId(user_id)})
        if not verify_password(current_password, user["password"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    hashed_password = get_password_hash(new_password)
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"password": hashed_password, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "Password changed successfully"}
