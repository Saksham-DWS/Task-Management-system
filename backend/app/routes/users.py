from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
import re

from ..database import get_users_collection, get_groups_collection, get_projects_collection
from ..models import UserCreate, UserUpdate, NotificationPreferences
from ..services.auth import get_current_user, require_role, get_password_hash
from ..services.notifications import dispatch_notification

router = APIRouter(prefix="/api/users", tags=["Users"])

def normalize_id_list(values) -> list:
    if not values:
        return []
    normalized = []
    for value in values:
        if value is None:
            continue
        normalized.append(str(value))
    return list(dict.fromkeys(normalized))

async def ensure_manager_group_access(current_user: dict, group_id: str) -> dict:
    role = current_user.get("role", "user")
    if role in ["admin", "super_admin"]:
        return {}
    if role != "manager":
        raise HTTPException(status_code=403, detail="Not authorized")
    groups = get_groups_collection()
    try:
        group = await groups.find_one({"_id": ObjectId(group_id)})
    except Exception:
        group = None
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    current_user_id = str(current_user.get("_id") or "")
    access = current_user.get("access", {}) or {}
    group_ids = normalize_id_list(access.get("group_ids", []))
    if str(group.get("owner_id")) == current_user_id or str(group_id) in group_ids:
        return group
    raise HTTPException(status_code=403, detail="Not authorized to manage this group")

async def ensure_manager_project_access(current_user: dict, project_id: str) -> dict:
    role = current_user.get("role", "user")
    if role in ["admin", "super_admin"]:
        return {}
    if role != "manager":
        raise HTTPException(status_code=403, detail="Not authorized")
    projects = get_projects_collection()
    try:
        project = await projects.find_one({"_id": ObjectId(project_id)})
    except Exception:
        project = None
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    current_user_id = str(current_user.get("_id") or "")
    access = current_user.get("access", {}) or {}
    group_ids = normalize_id_list(access.get("group_ids", []))
    project_ids = normalize_id_list(access.get("project_ids", []))
    access_user_ids = normalize_id_list(project.get("access_user_ids") or project.get("accessUserIds") or [])
    collaborator_ids = normalize_id_list(project.get("collaborator_ids") or [])
    if str(project.get("owner_id") or "") == current_user_id:
        return project
    if current_user_id in access_user_ids or current_user_id in collaborator_ids:
        return project
    if str(project_id) in project_ids:
        return project
    if str(project.get("group_id") or "") in group_ids:
        return project
    raise HTTPException(status_code=403, detail="Not authorized to manage this project")


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
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    users = get_users_collection()
    
    # Case-insensitive email check
    existing = await users.find_one({"email": re.compile(f"^{re.escape(user_data.email)}$", re.IGNORECASE)})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    if len(user_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    if user_data.role.value == "super_admin" and current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Not authorized to create super admin users")
    if current_user.get("role") == "manager" and user_data.role.value not in ["user", "manager"]:
        raise HTTPException(status_code=403, detail="Managers can only create standard or manager users")

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
    if current_user.get("role") == "admin" and user_data.role.value == "admin":
        user_dict["admin_promoted_by"] = [str(current_user.get("_id"))]
    
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
    if current_user["_id"] != user_id and current_user.get("role") not in ["admin", "manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {k: v for k, v in user_data.dict().items() if v is not None}
    if "role" in update_data:
        if current_user.get("role") not in ["admin", "super_admin"]:
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
    if new_role not in ["admin", "manager", "user", "super_admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    current_role = current_user.get("role")
    if new_role == "super_admin" and current_role != "super_admin":
        raise HTTPException(status_code=403, detail="Not authorized to assign super admin role")
    existing = await users.find_one({"_id": ObjectId(user_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    if current_role != "super_admin" and existing.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Not authorized to change super admin role")
    is_self = str(current_user.get("_id")) == str(user_id)
    if is_self:
        if current_role == "super_admin":
            pass
        elif current_role == "admin" and new_role in ["manager", "user"]:
            pass
        else:
            raise HTTPException(status_code=403, detail="Not authorized to change your own role")

    update_ops = {"$set": {"role": new_role, "updated_at": datetime.utcnow()}}
    if current_role == "super_admin" and str(current_user.get("_id")) == str(user_id) and new_role != "super_admin":
        update_ops["$set"]["super_admin_lock"] = False
    if current_role == "admin" and new_role == "admin":
        update_ops.setdefault("$addToSet", {})["admin_promoted_by"] = str(current_user.get("_id"))
    result = await users.update_one({"_id": ObjectId(user_id)}, update_ops)
    
    user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    user["_id"] = str(user["_id"])
    return user


@router.post("/access/{user_id}/group")
async def grant_group_access(
    user_id: str,
    data: dict,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    users = get_users_collection()
    groups = get_groups_collection()
    item_id = data.get("itemId")
    if item_id:
        await ensure_manager_group_access(current_user, item_id)
    
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$addToSet": {"access.group_ids": item_id}}
    )

    group = None
    if item_id:
        try:
            group = await groups.find_one({"_id": ObjectId(item_id)})
        except Exception:
            group = await groups.find_one({"_id": item_id})
    recipients = [user_id] if user_id else []
    if recipients:
        group_name = group.get("name") if group else "group"
        await dispatch_notification(
            recipients,
            "group_access_granted",
            f'{current_user.get("name","Unknown")} added you to {group_name}.',
            current_user,
            send_email=True,
            include_actor=True
        )

    user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    user["_id"] = str(user["_id"])
    return user


@router.delete("/access/{user_id}/group/{item_id}")
async def revoke_group_access(
    user_id: str,
    item_id: str,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    users = get_users_collection()
    if item_id:
        await ensure_manager_group_access(current_user, item_id)
    
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$pull": {"access.group_ids": item_id}}
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
    projects = get_projects_collection()
    item_id = data.get("itemId")
    if item_id:
        await ensure_manager_project_access(current_user, item_id)
    
    await users.update_one(
        {"_id": ObjectId(user_id)},
        {"$addToSet": {"access.project_ids": item_id}}
    )

    project = None
    if item_id:
        try:
            project = await projects.find_one({"_id": ObjectId(item_id)})
        except Exception:
            project = await projects.find_one({"_id": item_id})
    recipients = [user_id] if user_id else []
    if recipients:
        project_name = project.get("name") if project else "project"
        await dispatch_notification(
            recipients,
            "project_access_granted",
            f'{current_user.get("name","Unknown")} added you to project "{project_name}".',
            current_user,
            project_id=item_id,
            send_email=True,
            include_actor=True
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
    if item_id:
        await ensure_manager_project_access(current_user, item_id)
    
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
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    """Delete a user. Admins can delete anyone; managers cannot delete admins/super admins."""
    users = get_users_collection()
    
    if current_user["_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    # Check if user exists
    user = await users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") == "super_admin" and current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete a super admin")
    if current_user.get("role") == "manager" and user.get("role") in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete admin users")
    if current_user.get("role") == "admin" and user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete admin users")
    
    # Don't allow deleting the last admin
    if user.get("role") == "admin":
        admin_count = await users.count_documents({"role": "admin"})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    if user.get("role") == "super_admin":
        super_admin_count = await users.count_documents({"role": "super_admin"})
        if super_admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last super admin")
    
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
    if current_user["_id"] != user_id and current_user.get("role") not in ["admin", "super_admin"]:
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
