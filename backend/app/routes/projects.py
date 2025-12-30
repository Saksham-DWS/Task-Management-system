from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import Body

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

def dt_to_iso_z(value):
    if not value:
        return None
    if isinstance(value, str):
        if value.endswith(("Z", "z")):
            return value
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None, microsecond=0)
            return parsed.isoformat() + "Z"
        except Exception:
            return value + "Z"
    if isinstance(value, datetime):
        if value.tzinfo:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.replace(microsecond=0).isoformat() + "Z"
    return None

def build_project_activity(description: str, current_user: dict) -> dict:
    return {
        "description": description,
        "timestamp": project_activity_timestamp(),
        "user": current_user.get("name", "Unknown"),
        "user_id": current_user.get("_id")
    }

def normalize_id_list(ids) -> list:
    if not ids:
        return []
    normalized = []
    for value in ids:
        if value is None:
            continue
        normalized.append(str(value))
    # Preserve order while removing duplicates
    return list(dict.fromkeys(normalized))

def to_object_ids(id_list: list) -> list:
    object_ids = []
    for value in id_list or []:
        try:
            object_ids.append(ObjectId(value))
        except Exception:
            continue
    return object_ids

def has_category_access(current_user: dict, category_id: str) -> bool:
    role = current_user.get("role", "user")
    if role in ["admin", "manager"]:
        return True
    access = current_user.get("access", {}) or {}
    return category_id in access.get("category_ids", [])

def has_project_access(current_user: dict, project_id: str, category_id: str, project: dict | None = None) -> bool:
    role = current_user.get("role", "user")
    if role in ["admin", "manager"]:
        return True
    current_user_id = str(current_user.get("_id"))
    access = current_user.get("access", {}) or {}
    if category_id in access.get("category_ids", []):
        return True
    if project_id in access.get("project_ids", []):
        return True
    if project:
        if str(project.get("owner_id")) == current_user_id:
            return True
        if current_user_id in normalize_id_list(project.get("collaborator_ids")):
            return True
        if current_user_id in normalize_id_list(project.get("access_user_ids")):
            return True
    return False

def next_goal_id(goals: list) -> int:
    if not goals:
        return 1
    ids = []
    for g in goals:
        if isinstance(g, dict):
            ids.append(g.get("id", 0))
        else:
            ids.append(getattr(g, "id", 0))
    try:
        return max(int(i) for i in ids) + 1
    except Exception:
        return len(goals) + 1

def next_achievement_id(replies: list) -> int:
    if not replies:
        return 1
    try:
        return max(int(r.get("id", 0)) for r in replies if isinstance(r, dict)) + 1
    except Exception:
        return len(replies) + 1


async def sync_user_project_access(project_id: str, new_access_ids: list, existing_access_ids: list):
    """Update user.access.project_ids for newly added or removed project managers."""
    users = get_users_collection()
    new_ids = set(normalize_id_list(new_access_ids))
    current_ids = set(normalize_id_list(existing_access_ids))

    to_add = list(new_ids - current_ids)
    to_remove = list(current_ids - new_ids)

    if to_add:
        await users.update_many(
            {"_id": {"$in": to_object_ids(to_add)}},
            {"$addToSet": {"access.project_ids": project_id}}
        )
    if to_remove:
        await users.update_many(
            {"_id": {"$in": to_object_ids(to_remove)}},
            {"$pull": {"access.project_ids": project_id}}
        )
    return to_add, to_remove

async def apply_access_update(
    project_id: str,
    access_ids: list,
    current_user: dict,
    existing: dict | None = None
):
    projects = get_projects_collection()
    if existing is None:
        existing = await projects.find_one({"_id": ObjectId(project_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Project not found")

    existing_access_ids = normalize_id_list(existing.get("access_user_ids") or existing.get("accessUserIds") or [])
    normalized_access = normalize_id_list(access_ids)
    owner_id = str(existing.get("owner_id") or current_user.get("_id"))
    if owner_id and owner_id not in normalized_access:
        normalized_access.append(owner_id)

    if normalized_access == existing_access_ids:
        return existing, []

    added, removed = await sync_user_project_access(project_id, normalized_access, existing_access_ids)

    activity_entry = {
        **build_project_activity(
            f"{current_user.get('name', 'Unknown')} updated project access (added {len(added)}, removed {len(removed)})",
            current_user
        ),
        "changes": [{
            "field": "Project Access",
            "before": len(existing_access_ids),
            "after": len(normalized_access)
        }]
    }

    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {
            "$set": {"access_user_ids": normalized_access, "updated_at": datetime.utcnow()},
            "$push": {"activity": activity_entry}
        }
    )

    updated = await projects.find_one({"_id": ObjectId(project_id)})
    return updated, activity_entry


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

    # Get project access users (project-level managers/owners)
    access_user_ids = normalize_id_list(
        project.get("access_user_ids")
        or project.get("accessUserIds")
        or []
    )
    access_users = []
    for uid in access_user_ids:
        # Try ObjectId lookup first, fallback to plain string lookup
        user = None
        try:
            user = await users.find_one({"_id": ObjectId(uid)}, {"password": 0})
        except Exception:
            user = None
        if not user:
            user = await users.find_one({"_id": uid}, {"password": 0})
        if user:
            user["_id"] = str(user["_id"])
            access_users.append(user)
    project["access_user_ids"] = access_user_ids
    project["access_users"] = access_users
    
    # Get task count
    task_count = await tasks.count_documents({"project_id": project["_id"]})
    project["task_count"] = task_count
    
    # Calculate health score
    project_tasks = []
    member_ids = set()
    if project.get("owner_id"):
        member_ids.add(project["owner_id"])
    for access_id in access_user_ids:
        member_ids.add(access_id)
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

    # Normalize goals and achievements timestamps
    normalized_goals = []
    goals = project.get("weekly_goals") or []
    for g in goals:
        if not isinstance(g, dict):
            continue
        g = dict(g)
        g["created_at"] = dt_to_iso_z(g.get("created_at"))
        g["achievements"] = g.get("achievements") or []
        normalized_achievements = []
        for r in g["achievements"]:
            if not isinstance(r, dict):
                continue
            r = dict(r)
            r["created_at"] = dt_to_iso_z(r.get("created_at"))
            normalized_achievements.append(r)
        g["achievements"] = normalized_achievements
        normalized_goals.append(g)
    project["weekly_goals"] = normalized_goals
    
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
        user_id = current_user.get("_id")

        filters = []
        if category_ids:
            filters.append({"category_id": {"$in": category_ids}})
        if project_ids:
            filters.append({"_id": {"$in": [ObjectId(pid) for pid in project_ids if ObjectId.is_valid(pid)]}})
        if user_id:
            filters.extend([
                {"owner_id": user_id},
                {"collaborator_ids": user_id},
                {"access_user_ids": user_id}
            ])

        if not filters:
            return []

        cursor = projects.find({"$or": filters})
    
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
    if not has_project_access(current_user, project_id, project.get("category_id", ""), project):
        raise HTTPException(status_code=403, detail="Not authorized to view this project")
    
    return await populate_project(project)


@router.post("")
async def create_project(
    project_data: ProjectCreate,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    categories = get_categories_collection()

    incoming = project_data.model_dump(by_alias=True)
    
    # Verify category exists
    category_id = incoming.get("categoryId") or project_data.category_id
    category = await categories.find_one({"_id": ObjectId(category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if current_user.get("role") not in ["admin", "manager"] and not has_category_access(current_user, category_id):
        raise HTTPException(status_code=403, detail="Not authorized to create a project in this category")

    # Safely pick access/collaborators from either snake_case or camelCase
    access_user_ids = normalize_id_list(
        incoming.get("accessUserIds")
        or incoming.get("access_user_ids")
        or getattr(project_data, "access_user_ids", [])
    )
    collaborator_ids = normalize_id_list(
        incoming.get("collaboratorIds")
        or incoming.get("collaborator_ids")
        or getattr(project_data, "collaborator_ids", [])
    )
    owner_id = current_user["_id"]
    if owner_id not in access_user_ids:
        access_user_ids.append(owner_id)
    
    project_dict = {
        "name": project_data.name,
        "description": project_data.description,
        "status": project_data.status.value,
        "category_id": category_id,
        "start_date": project_data.start_date,
        "end_date": project_data.end_date,
        "owner_id": owner_id,
        "collaborator_ids": collaborator_ids,
        "access_user_ids": access_user_ids,
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
                {"field": "Project Access", "before": None, "after": len(access_user_ids)}
            ]
        }],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await projects.insert_one(project_dict)
    project_dict["_id"] = str(result.inserted_id)
    # Sync project_id into user access lists for project-level owners/managers
    if access_user_ids:
        await sync_user_project_access(project_dict["_id"], access_user_ids, [])
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
    if not has_project_access(current_user, project_id, existing.get("category_id", ""), existing):
        raise HTTPException(status_code=403, detail="Not authorized to update this project")
    
    # Prepare incoming data (respect aliases for date fields)
    incoming = project_data.model_dump(exclude_none=True, by_alias=True)
    raw_input = project_data.model_dump(exclude_none=True)
    incoming_access_ids = incoming.pop("accessUserIds", incoming.pop("access_user_ids", None))
    incoming_collaborator_ids = incoming.pop("collaboratorIds", incoming.pop("collaborator_ids", None))

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

    # Handle collaborator updates if provided
    if incoming_collaborator_ids is not None:
        normalized_collabs = normalize_id_list(incoming_collaborator_ids)
        set_data["collaborator_ids"] = normalized_collabs
        before = normalize_id_list(existing.get("collaborator_ids", []))
        if before != normalized_collabs:
            changes.append({
                "field": "Team Members",
                "before": len(before),
                "after": len(normalized_collabs)
            })
            descriptions.append(f"{actor_display} updated project collaborators")

    # Handle project access updates if provided
    if incoming_access_ids is not None:
        normalized_access = normalize_id_list(incoming_access_ids)
        # Fallback: if only snake_case provided
        if not normalized_access and raw_input.get("access_user_ids"):
            normalized_access = normalize_id_list(raw_input.get("access_user_ids"))
        updated_after_access, activity_entry = await apply_access_update(project_id, normalized_access, current_user, existing)
        existing = updated_after_access
        if activity_entry:
            # If we already built an activity entry inside apply_access_update, we don't need to add another change here.
            pass

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
    
    # Clean up user access entries
    users = get_users_collection()
    await users.update_many(
        {"access.project_ids": project_id},
        {"$pull": {"access.project_ids": project_id}}
    )
    
    return {"message": "Project deleted"}


@router.put("/{project_id}/access")
async def update_project_access(
    project_id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    existing = await projects.find_one({"_id": ObjectId(project_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    if not has_project_access(current_user, project_id, existing.get("category_id", ""), existing):
        raise HTTPException(status_code=403, detail="Not authorized to update this project")

    access_ids = data.get("accessUserIds") or data.get("access_user_ids") or []
    updated, _ = await apply_access_update(project_id, access_ids, current_user, existing)
    return await populate_project(updated)


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

@router.post("/{project_id}/goals")
async def add_project_goal(
    project_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Add a project-level goal with author and timestamp."""
    projects = get_projects_collection()
    text = (data.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Goal text is required")

    project = await projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not has_project_access(current_user, project_id, project.get("category_id", ""), project):
        raise HTTPException(status_code=403, detail="Not authorized to add goals")

    goals = project.get("weekly_goals") or []
    goal = {
        "id": next_goal_id(goals),
        "text": text,
        "created_at": datetime.utcnow(),
        "created_by_id": current_user["_id"],
        "created_by_name": current_user.get("name", "Unknown"),
        "achievements": [],
        "achievement_after_days": 7
    }
    activity = build_project_activity(
        f'Project goal added: "{text}" by {current_user.get("name", "Unknown")}',
        current_user
    )
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {
            "$set": {"weekly_goals": goals + [goal], "updated_at": datetime.utcnow()},
            "$push": {"activity": activity}
        }
    )
    project = await projects.find_one({"_id": ObjectId(project_id)})
    return await populate_project(project)

@router.post("/{project_id}/goals/{goal_id}/achievements")
async def add_project_goal_achievement(
    project_id: str,
    goal_id: int,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Add an achievement (reply) to a project goal; only goal author or admin."""
    projects = get_projects_collection()
    text = (data.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Achievement text is required")
    project = await projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not has_project_access(current_user, project_id, project.get("category_id", ""), project):
        raise HTTPException(status_code=403, detail="Not authorized to log achievements")

    goals = project.get("weekly_goals") or []
    target = None
    for g in goals:
        if str(g.get("id")) == str(goal_id):
            target = g
            break
    if not target:
        raise HTTPException(status_code=404, detail="Goal not found")
    is_admin = current_user.get("role") in ["admin", "manager"]
    if not is_admin and str(target.get("created_by_id")) != str(current_user.get("_id")):
        raise HTTPException(status_code=403, detail="Only goal owner or admin can add achievement")

    # Enforce 7-day window
    created_at = target.get("created_at")
    try:
        created_dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except Exception:
        created_dt = datetime.utcnow()
    if created_dt + timedelta(days=7) > datetime.utcnow():
        raise HTTPException(status_code=400, detail="Achievement logging allowed after 7 days for all users")

    replies = target.get("achievements") or []
    reply = {
        "id": next_achievement_id(replies),
        "text": text,
        "created_at": datetime.utcnow(),
        "created_by_id": current_user["_id"],
        "created_by_name": current_user.get("name", "Unknown")
    }
    replies.append(reply)
    target["achievements"] = replies

    # persist
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"weekly_goals": goals, "updated_at": datetime.utcnow()}}
    )

    activity = build_project_activity(
        f'Achievement logged for goal "{target.get("text","")}": "{text}" by {current_user.get("name","Unknown")}',
        current_user
    )
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$push": {"activity": activity}}
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


# Project Comments
@router.get("/{project_id}/comments")
async def get_project_comments(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    project = await projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not has_project_access(current_user, project_id, project.get("category_id", ""), project):
        raise HTTPException(status_code=403, detail="Not authorized")

    comments_col = get_comments_collection()
    users = get_users_collection()
    cursor = comments_col.find({"project_id": project_id}).sort("created_at", 1)
    result = []
    async for comment in cursor:
        comment["_id"] = str(comment["_id"])
        comment["created_at"] = dt_to_iso_z(comment.get("created_at"))
        if comment.get("user_id"):
            try:
                user = await users.find_one({"_id": ObjectId(comment["user_id"])}, {"password": 0})
                if user:
                    user["_id"] = str(user["_id"])
                    comment["user"] = user
            except:
                pass
        result.append(comment)
    return result


@router.post("/{project_id}/comments")
async def add_project_comment(
    project_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    project = await projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not has_project_access(current_user, project_id, project.get("category_id", ""), project):
        raise HTTPException(status_code=403, detail="Not authorized")

    content = (data.get("content") or "").strip()
    if not content and not data.get("attachments"):
        raise HTTPException(status_code=400, detail="Content is required")

    comments_col = get_comments_collection()
    comment_dict = {
        "content": content,
        "project_id": project_id,
        "user_id": current_user["_id"],
        "attachments": data.get("attachments") or [],
        "created_at": datetime.utcnow(),
        "parent_id": data.get("parent_id") or data.get("parentId")
    }
    result = await comments_col.insert_one(comment_dict)
    comment_dict["_id"] = str(result.inserted_id)
    comment_dict["created_at"] = dt_to_iso_z(comment_dict.get("created_at"))

    users = get_users_collection()
    user = await users.find_one({"_id": ObjectId(current_user["_id"])}, {"password": 0})
    if user:
        user["_id"] = str(user["_id"])
        comment_dict["user"] = user

    target_label = "reply" if comment_dict.get("parent_id") else "comment"
    preview = (content or "")[:80]
    activity = build_project_activity(
        f'{current_user.get("name", "Unknown")} added a {target_label}: "{preview}"',
        current_user
    )
    await projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$push": {"activity": activity}}
    )
    return comment_dict


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
