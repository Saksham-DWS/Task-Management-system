from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List

from ..database import (
    get_projects_collection, 
    get_tasks_collection, 
    get_users_collection,
    get_categories_collection,
    get_comments_collection
)
from ..models import ProjectCreate, ProjectUpdate
from ..services.auth import get_current_user, require_role
from ..services.ai import generate_project_health

router = APIRouter(prefix="/api/projects", tags=["Projects"])

def project_activity_timestamp() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def build_project_activity(description: str, current_user: dict) -> dict:
    return {
        "description": description,
        "timestamp": project_activity_timestamp(),
        "user": current_user.get("name", "Unknown"),
        "user_id": current_user.get("_id")
    }

def has_category_access(current_user: dict, category_id: str) -> bool:
    role = current_user.get("role", "user")
    if role in ["admin", "manager"]:
        return True
    access = current_user.get("access", {}) or {}
    return category_id in access.get("category_ids", [])

def has_project_access(current_user: dict, project_id: str, category_id: str) -> bool:
    role = current_user.get("role", "user")
    if role in ["admin", "manager"]:
        return True
    access = current_user.get("access", {}) or {}
    if category_id in access.get("category_ids", []):
        return True
    return project_id in access.get("project_ids", [])


async def populate_project(project: dict) -> dict:
    users = get_users_collection()
    tasks = get_tasks_collection()
    
    project["_id"] = str(project["_id"])
    if project.get("endDate") and not project.get("end_date"):
        project["end_date"] = project.get("endDate")
    if project.get("startDate") and not project.get("start_date"):
        project["start_date"] = project.get("startDate")
    if project.get("end_date") and not project.get("endDate"):
        project["endDate"] = project.get("end_date")
    if project.get("start_date") and not project.get("startDate"):
        project["startDate"] = project.get("start_date")
    
    # Get owner
    if project.get("owner_id"):
        owner = await users.find_one({"_id": ObjectId(project["owner_id"])}, {"password": 0})
        if owner:
            owner["_id"] = str(owner["_id"])
            project["owner"] = owner
    
    # Get collaborators
    collaborator_ids = project.get("collaborator_ids", [])
    collaborators = []
    for cid in collaborator_ids:
        try:
            user = await users.find_one({"_id": ObjectId(cid)}, {"password": 0})
            if user:
                user["_id"] = str(user["_id"])
                collaborators.append(user)
        except:
            pass
    project["collaborators"] = collaborators
    
    # Get task count
    task_count = await tasks.count_documents({"project_id": project["_id"]})
    project["task_count"] = task_count
    
    # Calculate health score
    project_tasks = []
    member_ids = set()
    if project.get("owner_id"):
        member_ids.add(project["owner_id"])
    for collaborator_id in project.get("collaborator_ids", []):
        member_ids.add(collaborator_id)
    async for task in tasks.find({"project_id": project["_id"]}):
        task["_id"] = str(task["_id"])
        project_tasks.append(task)
        if task.get("assigned_by_id"):
            member_ids.add(task["assigned_by_id"])
        for assignee_id in task.get("assignee_ids", []):
            member_ids.add(assignee_id)
        for collaborator_id in task.get("collaborator_ids", []):
            member_ids.add(collaborator_id)
    
    project["health_score"] = await generate_project_health(project, project_tasks)
    
    members = []
    for member_id in member_ids:
        try:
            member = await users.find_one({"_id": ObjectId(member_id)}, {"password": 0})
            if member:
                member["_id"] = str(member["_id"])
                members.append(member)
        except:
            pass
    project["members"] = members

    # Normalize activity timestamps
    activity_raw = project.get("activity", [])
    if not isinstance(activity_raw, list):
        activity_raw = []
    normalized_activity = []
    for entry in activity_raw:
        if not isinstance(entry, dict):
            continue
        raw_timestamp = entry.get("timestamp") or entry.get("time") or entry.get("date")
        if isinstance(raw_timestamp, datetime):
            raw_timestamp = raw_timestamp.replace(microsecond=0).isoformat() + "Z"
        normalized_activity.append({
          "description": entry.get("description"),
          "timestamp": raw_timestamp,
          "changes": entry.get("changes", []),
          "user": entry.get("user"),
          "user_id": entry.get("user_id")
        })
    # Sort descending by timestamp for UI friendliness
    normalized_activity.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    project["activity"] = normalized_activity
    
    return project


@router.get("")
async def get_projects(current_user: dict = Depends(get_current_user)):
    projects = get_projects_collection()
    user_role = current_user.get("role", "user")
    user_access = current_user.get("access", {})
    
    if user_role in ["admin", "manager"]:
        cursor = projects.find({})
    else:
        category_ids = user_access.get("category_ids", [])
        project_ids = user_access.get("project_ids", [])
        
        query = {"$or": []}
        if category_ids:
            query["$or"].append({"category_id": {"$in": category_ids}})
        if project_ids:
            query["$or"].append({"_id": {"$in": [ObjectId(pid) for pid in project_ids]}})
        
        if not query["$or"]:
            return []
        
        cursor = projects.find(query)
    
    result = []
    async for project in cursor:
        result.append(await populate_project(project))
    return result


@router.get("/category/{category_id}")
async def get_projects_by_category(
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    if not has_category_access(current_user, category_id):
        raise HTTPException(status_code=403, detail="Not authorized to view this category")
    cursor = projects.find({"category_id": {"$in": [category_id, ObjectId(category_id)]}})
    
    result = []
    async for project in cursor:
        result.append(await populate_project(project))
    return result


@router.get("/{project_id}")
async def get_project(project_id: str, current_user: dict = Depends(get_current_user)):
    projects = get_projects_collection()
    project = await projects.find_one({"_id": ObjectId(project_id)})
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not has_project_access(current_user, project_id, project.get("category_id", "")):
        raise HTTPException(status_code=403, detail="Not authorized to view this project")
    
    return await populate_project(project)


@router.post("")
async def create_project(
    project_data: ProjectCreate,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    categories = get_categories_collection()
    
    # Verify category exists
    category = await categories.find_one({"_id": ObjectId(project_data.category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    project_dict = {
        "name": project_data.name,
        "description": project_data.description,
        "status": project_data.status.value,
        "category_id": project_data.category_id,
        "start_date": project_data.start_date,
        "end_date": project_data.end_date,
        "owner_id": current_user["_id"],
        "collaborator_ids": [],
        "weekly_goals": [],
        "weekly_achievements": [],
        "health_score": 50,
        "activity": [{
            **build_project_activity(
                f"Project created by {current_user.get('name', 'Unknown')}",
                current_user
            ),
            "changes": [
                {"field": "Name", "before": None, "after": project_data.name},
                {"field": "Description", "before": None, "after": project_data.description},
                {"field": "Status", "before": None, "after": project_data.status.value},
                {"field": "Start Date", "before": None, "after": project_data.start_date},
                {"field": "Due Date", "before": None, "after": project_data.end_date},
            ]
        }],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await projects.insert_one(project_dict)
    project_dict["_id"] = str(result.inserted_id)
    return await populate_project(project_dict)


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    project_data: ProjectUpdate,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    
    existing = await projects.find_one({"_id": ObjectId(project_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Prepare incoming data (respect aliases for date fields)
    incoming = project_data.model_dump(exclude_none=True, by_alias=True)

    field_labels = {
        "name": "Name",
        "description": "Description",
        "status": "Status",
        "start_date": "Start Date",
        "end_date": "Due Date"
    }

    def normalize_key(key: str) -> str:
        if key in ["startDate", "start_date"]:
            return "start_date"
        if key in ["endDate", "end_date"]:
            return "end_date"
        return key

    def parse_date(value):
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                # Allow plain dates (YYYY-MM-DD) and ISO strings
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return value
        return value

    def comparable(value):
        parsed = parse_date(value)
        if isinstance(parsed, datetime):
            return parsed.replace(microsecond=0)
        return parsed

    def format_for_log(key: str, value):
        if value is None:
            return "None"
        if key in ["start_date", "end_date"]:
            parsed = parse_date(value)
            if isinstance(parsed, datetime):
                return parsed.strftime("%d %b %Y")
        return str(value)

    set_data = {}
    changes = []
    descriptions = []

    actor_role = current_user.get("role", "user").capitalize()
    actor_name = current_user.get("name", "Unknown")
    actor_display = f"{actor_role} {actor_name}".strip()

    for raw_key, value in incoming.items():
        key = normalize_key(raw_key)
        prepared_value = parse_date(value) if key in ["start_date", "end_date"] else value

        # Look up existing value (handle legacy camelCase keys in DB)
        existing_value = existing.get(key)
        if key == "start_date":
            existing_value = existing_value or existing.get("startDate")
        if key == "end_date":
            existing_value = existing_value or existing.get("endDate")

        if comparable(existing_value) == comparable(prepared_value):
            # Skip unchanged values to avoid noisy activity
            continue

        set_data[key] = prepared_value

        label = field_labels.get(key, key)
        before_val = format_for_log(key, existing_value)
        after_val = format_for_log(key, prepared_value)
        changes.append({"field": label, "before": before_val, "after": after_val})
        descriptions.append(
            f"{actor_display} changed the {label.lower()} of this project to {after_val}"
        )

    if not set_data:
        # Nothing changed
        return await populate_project(existing)

    set_data["updated_at"] = datetime.utcnow()

    update_payload = {"$set": set_data}

    activity_entry = None
    if changes:
        activity_entry = {
            **build_project_activity("; ".join(descriptions), current_user),
            "changes": changes
        }
        update_payload["$push"] = {"activity": activity_entry}

    result = await projects.update_one({"_id": ObjectId(project_id)}, update_payload)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    project = await projects.find_one({"_id": ObjectId(project_id)})
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return await populate_project(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    force: bool = False,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    tasks = get_tasks_collection()
    comments = get_comments_collection()
    
    # Check if project exists
    project = await projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if project has tasks
    task_count = await tasks.count_documents({"project_id": project_id})
    if task_count > 0 and not force:
        raise HTTPException(
            status_code=400,
            detail="Project has tasks. Use force=true to delete project with all its tasks and comments."
        )

    if force and task_count > 0:
        # Delete comments for tasks under this project
        task_cursor = tasks.find({"project_id": project_id})
        async for task in task_cursor:
            await comments.delete_many({"task_id": str(task["_id"])})
        # Delete tasks
        await tasks.delete_many({"project_id": project_id})
    
    result = await projects.delete_one({"_id": ObjectId(project_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {"message": "Project deleted"}


@router.put("/{project_id}/goals")
async def update_project_goals(
    project_id: str,
    goals: List[dict],
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"weekly_goals": goals, "updated_at": datetime.utcnow()}}
    )
    
    project = await projects.find_one({"_id": ObjectId(project_id)})
    return await populate_project(project)


@router.put("/{project_id}/achievements")
async def update_project_achievements(
    project_id: str,
    achievements: List[dict],
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"weekly_achievements": achievements, "updated_at": datetime.utcnow()}}
    )
    
    project = await projects.find_one({"_id": ObjectId(project_id)})
    return await populate_project(project)


@router.post("/{project_id}/collaborators")
async def add_collaborator(
    project_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    users = get_users_collection()
    user_id = data.get("user_id") or data.get("userId")
    
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$addToSet": {"collaborator_ids": user_id}}
    )

    user_name = None
    if user_id:
        try:
            user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
            if user:
                user_name = user.get("name")
        except:
            pass
    actor_name = current_user.get("name", "Unknown")
    if user_name:
        description = f"User {user_name} added to project by {actor_name}"
    else:
        description = f"Project collaborator added by {actor_name}"
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$push": {"activity": build_project_activity(description, current_user)}}
    )
    
    project = await projects.find_one({"_id": ObjectId(project_id)})
    return await populate_project(project)


@router.delete("/{project_id}/collaborators/{user_id}")
async def remove_collaborator(
    project_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    users = get_users_collection()
    
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$pull": {"collaborator_ids": user_id}}
    )

    user_name = None
    if user_id:
        try:
            user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
            if user:
                user_name = user.get("name")
        except:
            pass
    actor_name = current_user.get("name", "Unknown")
    if user_name:
        description = f"User {user_name} removed from project by {actor_name}"
    else:
        description = f"Project collaborator removed by {actor_name}"
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$push": {"activity": build_project_activity(description, current_user)}}
    )
    
    project = await projects.find_one({"_id": ObjectId(project_id)})
    return await populate_project(project)
