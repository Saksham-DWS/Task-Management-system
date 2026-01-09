from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List

from ..database import get_groups_collection, get_projects_collection
from ..models import GroupCreate, GroupUpdate
from ..services.auth import get_current_user, require_role

router = APIRouter(prefix="/api/groups", tags=["Groups"])

async def get_project_counts_for_groups(group_ids: List[str]) -> dict:
    if not group_ids:
        return {}
    projects = get_projects_collection()
    pipeline = [
        {"$addFields": {"group_id_str": {"$toString": "$group_id"}}},
        {"$match": {"group_id_str": {"$in": group_ids}}},
        {"$group": {"_id": "$group_id_str", "count": {"$sum": 1}}}
    ]
    counts = {}
    async for row in projects.aggregate(pipeline):
        counts[str(row["_id"])] = row.get("count", 0)
    return counts

def has_group_access(current_user: dict, group_id: str) -> bool:
    role = current_user.get("role", "user")
    if role in ["admin", "manager", "super_admin"]:
        return True
    access = current_user.get("access", {}) or {}
    return group_id in access.get("group_ids", [])


async def get_group_with_count(group: dict) -> dict:
    projects = get_projects_collection()
    group_id = group["_id"]
    count = await projects.count_documents({
        "group_id": {"$in": [str(group_id), group_id]}
    })
    group["_id"] = str(group["_id"])
    group["project_count"] = count
    return group


@router.get("")
async def get_groups(current_user: dict = Depends(get_current_user)):
    groups = get_groups_collection()
    user_role = current_user.get("role", "user")
    user_access = current_user.get("access", {})
    
    # Admins and managers see all groups
    if user_role in ["admin", "manager", "super_admin"]:
        cursor = groups.find({})
    else:
        # Users see only groups they have access to
        group_ids = user_access.get("group_ids", [])
        if group_ids:
            cursor = groups.find({"_id": {"$in": [ObjectId(cid) for cid in group_ids]}})
        else:
            return []
    
    result = []
    group_list = []
    async for group in cursor:
        group_list.append(group)

    group_ids = [str(group["_id"]) for group in group_list]
    counts = await get_project_counts_for_groups(group_ids)

    for group in group_list:
        group_id = str(group["_id"])
        group["_id"] = group_id
        group["project_count"] = counts.get(group_id, 0)
        result.append(group)

    return result


@router.get("/{group_id}")
async def get_group(group_id: str, current_user: dict = Depends(get_current_user)):
    groups = get_groups_collection()
    group = await groups.find_one({"_id": ObjectId(group_id)})
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not has_group_access(current_user, group_id):
        raise HTTPException(status_code=403, detail="Not authorized to view this group")
    
    return await get_group_with_count(group)


@router.post("")
async def create_group(
    group_data: GroupCreate,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    groups = get_groups_collection()
    
    group_dict = {
        "name": group_data.name,
        "description": group_data.description,
        "color": group_data.color,
        "owner_id": current_user["_id"],
        "weekly_goals": [],
        "weekly_achievements": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await groups.insert_one(group_dict)
    group_dict["_id"] = str(result.inserted_id)
    group_dict["project_count"] = 0
    return group_dict


@router.put("/{group_id}")
async def update_group(
    group_id: str,
    group_data: GroupUpdate,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    groups = get_groups_collection()
    
    update_data = {k: v for k, v in group_data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.utcnow()
    
    result = await groups.update_one(
        {"_id": ObjectId(group_id)},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    
    group = await groups.find_one({"_id": ObjectId(group_id)})
    return await get_group_with_count(group)


@router.delete("/{group_id}")
async def delete_group(
    group_id: str,
    force: bool = False,
    current_user: dict = Depends(require_role(["admin"]))
):
    """Delete a group. Admin only. Use force=true to delete with all projects and tasks."""
    from ..database import get_tasks_collection, get_comments_collection
    
    groups = get_groups_collection()
    projects = get_projects_collection()
    tasks = get_tasks_collection()
    comments = get_comments_collection()
    
    # Check if group exists
    group = await groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if group has projects
    project_count = await projects.count_documents({"group_id": group_id})
    
    if project_count > 0 and not force:
        raise HTTPException(
            status_code=400, 
            detail=f"Group has {project_count} projects. Use force=true to delete all."
        )
    
    if force and project_count > 0:
        # Delete all tasks and comments in projects under this group
        project_cursor = projects.find({"group_id": group_id})
        async for proj in project_cursor:
            project_id = str(proj["_id"])
            await tasks.delete_many({"project_id": project_id})
            await comments.delete_many({"project_id": project_id})
        
        # Delete all projects
        await projects.delete_many({"group_id": group_id})
    
    # Delete the group
    result = await groups.delete_one({"_id": ObjectId(group_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    
    return {"message": "Group and all related data deleted successfully"}


from pydantic import BaseModel

class GoalsUpdate(BaseModel):
    goals: List[dict]

class AchievementsUpdate(BaseModel):
    achievements: List[dict]

@router.put("/{group_id}/goals")
async def update_group_goals(
    group_id: str,
    data: GoalsUpdate,
    current_user: dict = Depends(get_current_user)
):
    groups = get_groups_collection()
    
    if not has_group_access(current_user, group_id):
        raise HTTPException(status_code=403, detail="Not authorized to update this group")
    
    await groups.update_one(
        {"_id": ObjectId(group_id)},
        {"$set": {"weekly_goals": data.goals, "updated_at": datetime.utcnow()}}
    )
    
    group = await groups.find_one({"_id": ObjectId(group_id)})
    return await get_group_with_count(group)


@router.put("/{group_id}/achievements")
async def update_group_achievements(
    group_id: str,
    data: AchievementsUpdate,
    current_user: dict = Depends(get_current_user)
):
    groups = get_groups_collection()
    
    if not has_group_access(current_user, group_id):
        raise HTTPException(status_code=403, detail="Not authorized to update this group")
    
    await groups.update_one(
        {"_id": ObjectId(group_id)},
        {"$set": {"weekly_achievements": data.achievements, "updated_at": datetime.utcnow()}}
    )
    
    group = await groups.find_one({"_id": ObjectId(group_id)})
    return await get_group_with_count(group)
