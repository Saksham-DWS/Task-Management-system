from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List

from ..database import get_categories_collection, get_projects_collection
from ..models import CategoryCreate, CategoryUpdate
from ..services.auth import get_current_user, require_role

router = APIRouter(prefix="/api/categories", tags=["Categories"])

def has_category_access(current_user: dict, category_id: str) -> bool:
    role = current_user.get("role", "user")
    if role in ["admin", "manager"]:
        return True
    access = current_user.get("access", {}) or {}
    return category_id in access.get("category_ids", [])


async def get_category_with_count(category: dict) -> dict:
    projects = get_projects_collection()
    category_id = category["_id"]
    count = await projects.count_documents({
        "category_id": {"$in": [str(category_id), category_id]}
    })
    category["_id"] = str(category["_id"])
    category["project_count"] = count
    return category


@router.get("")
async def get_categories(current_user: dict = Depends(get_current_user)):
    categories = get_categories_collection()
    user_role = current_user.get("role", "user")
    user_access = current_user.get("access", {})
    
    # Admins and managers see all categories
    if user_role in ["admin", "manager"]:
        cursor = categories.find({})
    else:
        # Users see only categories they have access to
        category_ids = user_access.get("category_ids", [])
        if category_ids:
            cursor = categories.find({"_id": {"$in": [ObjectId(cid) for cid in category_ids]}})
        else:
            return []
    
    result = []
    async for category in cursor:
        result.append(await get_category_with_count(category))
    return result


@router.get("/{category_id}")
async def get_category(category_id: str, current_user: dict = Depends(get_current_user)):
    categories = get_categories_collection()
    category = await categories.find_one({"_id": ObjectId(category_id)})
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if not has_category_access(current_user, category_id):
        raise HTTPException(status_code=403, detail="Not authorized to view this category")
    
    return await get_category_with_count(category)


@router.post("")
async def create_category(
    category_data: CategoryCreate,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    categories = get_categories_collection()
    
    category_dict = {
        "name": category_data.name,
        "description": category_data.description,
        "color": category_data.color,
        "owner_id": current_user["_id"],
        "weekly_goals": [],
        "weekly_achievements": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await categories.insert_one(category_dict)
    category_dict["_id"] = str(result.inserted_id)
    category_dict["project_count"] = 0
    return category_dict


@router.put("/{category_id}")
async def update_category(
    category_id: str,
    category_data: CategoryUpdate,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    categories = get_categories_collection()
    
    update_data = {k: v for k, v in category_data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.utcnow()
    
    result = await categories.update_one(
        {"_id": ObjectId(category_id)},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    category = await categories.find_one({"_id": ObjectId(category_id)})
    return await get_category_with_count(category)


@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    force: bool = False,
    current_user: dict = Depends(require_role(["admin"]))
):
    """Delete a category. Admin only. Use force=true to delete with all projects and tasks."""
    from ..database import get_tasks_collection, get_comments_collection
    
    categories = get_categories_collection()
    projects = get_projects_collection()
    tasks = get_tasks_collection()
    comments = get_comments_collection()
    
    # Check if category exists
    category = await categories.find_one({"_id": ObjectId(category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if category has projects
    project_count = await projects.count_documents({"category_id": category_id})
    
    if project_count > 0 and not force:
        raise HTTPException(
            status_code=400, 
            detail=f"Category has {project_count} projects. Use force=true to delete all."
        )
    
    if force and project_count > 0:
        # Delete all tasks and comments in projects under this category
        project_cursor = projects.find({"category_id": category_id})
        async for proj in project_cursor:
            project_id = str(proj["_id"])
            await tasks.delete_many({"project_id": project_id})
            await comments.delete_many({"project_id": project_id})
        
        # Delete all projects
        await projects.delete_many({"category_id": category_id})
    
    # Delete the category
    result = await categories.delete_one({"_id": ObjectId(category_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    return {"message": "Category and all related data deleted successfully"}


from pydantic import BaseModel

class GoalsUpdate(BaseModel):
    goals: List[dict]

class AchievementsUpdate(BaseModel):
    achievements: List[dict]

@router.put("/{category_id}/goals")
async def update_category_goals(
    category_id: str,
    data: GoalsUpdate,
    current_user: dict = Depends(get_current_user)
):
    categories = get_categories_collection()
    
    if not has_category_access(current_user, category_id):
        raise HTTPException(status_code=403, detail="Not authorized to update this category")
    
    await categories.update_one(
        {"_id": ObjectId(category_id)},
        {"$set": {"weekly_goals": data.goals, "updated_at": datetime.utcnow()}}
    )
    
    category = await categories.find_one({"_id": ObjectId(category_id)})
    return await get_category_with_count(category)


@router.put("/{category_id}/achievements")
async def update_category_achievements(
    category_id: str,
    data: AchievementsUpdate,
    current_user: dict = Depends(get_current_user)
):
    categories = get_categories_collection()
    
    if not has_category_access(current_user, category_id):
        raise HTTPException(status_code=403, detail="Not authorized to update this category")
    
    await categories.update_one(
        {"_id": ObjectId(category_id)},
        {"$set": {"weekly_achievements": data.achievements, "updated_at": datetime.utcnow()}}
    )
    
    category = await categories.find_one({"_id": ObjectId(category_id)})
    return await get_category_with_count(category)
