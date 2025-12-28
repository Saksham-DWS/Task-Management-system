from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime, timedelta
from typing import List

from ..database import (
    get_tasks_collection,
    get_projects_collection,
    get_users_collection,
    get_categories_collection,
    get_comments_collection
)
from ..models import TaskCreate, TaskUpdate, CommentCreate, TaskStatus
from ..services.auth import get_current_user
from ..services.ai import analyze_task_risk

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])

STATUS_ORDER = [
    TaskStatus.NOT_STARTED.value,
    TaskStatus.IN_PROGRESS.value,
    TaskStatus.HOLD.value,
    TaskStatus.COMPLETED.value
]

STATUS_ALIAS = {
    "not_started": TaskStatus.NOT_STARTED.value,
    "in_progress": TaskStatus.IN_PROGRESS.value,
    "on_hold": TaskStatus.HOLD.value,
    "hold": TaskStatus.HOLD.value,
    "completed": TaskStatus.COMPLETED.value
}

def normalize_status(status: str) -> str:
    if not status:
        return status
    return STATUS_ALIAS.get(str(status), status)

def is_forward_status(current_status: str, next_status: str) -> bool:
    if not current_status or not next_status:
        return True
    current_normalized = normalize_status(current_status)
    next_normalized = normalize_status(next_status)
    try:
        return STATUS_ORDER.index(next_normalized) >= STATUS_ORDER.index(current_normalized)
    except ValueError:
        return True

def activity_timestamp() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def build_activity_entry(description: str, current_user: dict) -> dict:
    return {
        "description": description,
        "timestamp": activity_timestamp(),
        "user_id": current_user["_id"],
        "user": current_user.get("name", "Unknown")
    }

async def fetch_user_names(user_ids: List[str]) -> List[str]:
    if not user_ids:
        return []
    users = get_users_collection()
    object_ids = []
    for uid in user_ids:
        try:
            object_ids.append(ObjectId(uid))
        except:
            continue
    if not object_ids:
        return []
    cursor = users.find({"_id": {"$in": object_ids}}, {"name": 1})
    names_by_id = {}
    async for user in cursor:
        names_by_id[str(user["_id"])] = user.get("name")
    ordered_names = []
    for uid in user_ids:
        name = names_by_id.get(uid)
        if name:
            ordered_names.append(name)
    return ordered_names

async def push_project_activity(project_id: str, entries: List[dict]):
    if not project_id or not entries:
        return
    projects = get_projects_collection()
    filters = []
    if isinstance(project_id, ObjectId):
        filters.append({"_id": project_id})
        filters.append({"_id": str(project_id)})
    else:
        try:
            filters.append({"_id": ObjectId(project_id)})
        except:
            pass
        filters.append({"_id": project_id})
    project_filter = filters[0] if len(filters) == 1 else {"$or": filters}
    await projects.update_one(
        project_filter,
        {"$push": {"activity": {"$each": entries}}}
    )

def normalize_activity_entries(activity_raw: list) -> list:
    if not isinstance(activity_raw, list):
        return []
    normalized = []
    for entry in activity_raw:
        if not isinstance(entry, dict):
            continue
        raw_timestamp = entry.get("timestamp") or entry.get("time") or entry.get("date")
        if isinstance(raw_timestamp, datetime):
            raw_timestamp = raw_timestamp.replace(microsecond=0).isoformat() + "Z"
        normalized.append({
            "description": entry.get("description"),
            "timestamp": raw_timestamp,
            "user": entry.get("user"),
            "user_id": entry.get("user_id")
        })
    return normalized

async def check_project_auto_complete(project_id: str):
    """Auto-complete project if no tasks in 'not_started' or 'in_progress'"""
    tasks = get_tasks_collection()
    
    # Count tasks that are not completed or on hold
    active_tasks = await tasks.count_documents({
        "project_id": project_id,
        "status": {"$in": ["not_started", "in_progress"]}
    })
    
    total_tasks = await tasks.count_documents({"project_id": project_id})
    
    if total_tasks > 0 and active_tasks == 0:
        # All tasks are either completed or on hold - mark project as completed
        await projects.update_one(
            {"_id": ObjectId(project_id)},
            {"$set": {"status": "completed", "updated_at": datetime.utcnow()}}
        )
    elif active_tasks > 0:
        # Has active tasks - ensure project is ongoing
        project = await projects.find_one({"_id": ObjectId(project_id)})
        if project and project.get("status") == "completed":
            await projects.update_one(
                {"_id": ObjectId(project_id)},
                {"$set": {"status": "ongoing", "updated_at": datetime.utcnow()}}
            )


async def populate_task(task: dict) -> dict:
    users = get_users_collection()
    projects = get_projects_collection()
    categories = get_categories_collection()
    
    task["_id"] = str(task["_id"])
    
    # Get assigned by
    if task.get("assigned_by_id"):
        try:
            user = await users.find_one({"_id": ObjectId(task["assigned_by_id"])}, {"password": 0})
            if user:
                user["_id"] = str(user["_id"])
                task["assigned_by"] = user
        except:
            pass
    
    # Get assignees
    assignees = []
    for aid in task.get("assignee_ids", []):
        try:
            user = await users.find_one({"_id": ObjectId(aid)}, {"password": 0})
            if user:
                user["_id"] = str(user["_id"])
                assignees.append(user)
        except:
            pass
    task["assignees"] = assignees
    
    # Get collaborators
    collaborators = []
    for cid in task.get("collaborator_ids", []):
        try:
            user = await users.find_one({"_id": ObjectId(cid)}, {"password": 0})
            if user:
                user["_id"] = str(user["_id"])
                collaborators.append(user)
        except:
            pass
    task["collaborators"] = collaborators
    
    # Get project
    if task.get("project_id"):
        try:
            project = await projects.find_one({"_id": ObjectId(task["project_id"])})
            if project:
                project["_id"] = str(project["_id"])
                task["project"] = {"_id": project["_id"], "name": project["name"]}
        except:
            pass
    
    # Get category
    if task.get("category_id"):
        try:
            category = await categories.find_one({"_id": ObjectId(task["category_id"])})
            if category:
                category["_id"] = str(category["_id"])
                task["category"] = {"_id": category["_id"], "name": category["name"]}
        except:
            pass
    
    # Analyze risk
    risk_analysis = await analyze_task_risk(task)
    task["ai_risk"] = risk_analysis["ai_risk"]
    task["ai_risk_reason"] = risk_analysis["ai_risk_reason"]
    
    # Check if achievements can be added (7 days after goals were set)
    task["can_add_achievements"] = False
    if task.get("goals_created_at"):
        goals_created = task["goals_created_at"]
        if isinstance(goals_created, str):
            goals_created = datetime.fromisoformat(goals_created.replace('Z', '+00:00'))
        if datetime.utcnow() >= goals_created + timedelta(days=7):
            task["can_add_achievements"] = True

    task["activity"] = normalize_activity_entries(task.get("activity", []))
    
    return task


@router.get("")
async def get_tasks(current_user: dict = Depends(get_current_user)):
    tasks = get_tasks_collection()
    cursor = tasks.find({})
    
    result = []
    async for task in cursor:
        result.append(await populate_task(task))
    return result


@router.get("/my")
async def get_my_tasks(current_user: dict = Depends(get_current_user)):
    """Get tasks assigned to current user, sorted by newest first"""
    tasks = get_tasks_collection()
    user_id = current_user["_id"]
    
    cursor = tasks.find({
        "$or": [
            {"assignee_ids": user_id},
            {"collaborator_ids": user_id},
            {"assigned_by_id": user_id}
        ]
    }).sort("created_at", -1)  # Sort by newest first
    
    result = []
    async for task in cursor:
        result.append(await populate_task(task))
    return result


@router.get("/project/{project_id}")
async def get_tasks_by_project(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    tasks = get_tasks_collection()
    cursor = tasks.find({"project_id": project_id})
    
    result = []
    async for task in cursor:
        result.append(await populate_task(task))
    return result


@router.get("/{task_id}")
async def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    tasks = get_tasks_collection()
    task = await tasks.find_one({"_id": ObjectId(task_id)})
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return await populate_task(task)


@router.post("")
async def create_task(
    task_data: TaskCreate,
    current_user: dict = Depends(get_current_user)
):
    tasks = get_tasks_collection()
    projects = get_projects_collection()
    
    # Get project to get category_id
    project = await projects.find_one({"_id": ObjectId(task_data.project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Process goals if provided
    goals = []
    goals_created_at = None
    achievements_due_at = None
    
    if task_data.weekly_goals:
        goals_created_at = datetime.utcnow()
        achievements_due_at = goals_created_at + timedelta(days=7)
        for i, goal in enumerate(task_data.weekly_goals):
            goals.append({
                "id": i + 1,
                "text": goal.text if hasattr(goal, 'text') else goal.get('text', ''),
                "status": "pending",
                "created_at": goals_created_at
            })
    
    task_dict = {
        "title": task_data.title,
        "description": task_data.description,
        "status": task_data.status.value,
        "priority": task_data.priority.value,
        "project_id": task_data.project_id,
        "category_id": project["category_id"],
        "assigned_by_id": current_user["_id"],
        "assignee_ids": task_data.assignee_ids,
        "collaborator_ids": task_data.collaborator_ids,
        "assigned_date": task_data.assigned_date,
        "due_date": task_data.due_date,
        "completed_at": None,
        "subtasks": [],
        "weekly_goals": goals,
        "weekly_achievements": [],
        "goals_created_at": goals_created_at,
        "achievements_due_at": achievements_due_at,
        "attachments": [],
        "activity": [
            build_activity_entry(
                f"Task created by {current_user.get('name', 'Unknown')}",
                current_user
            )
        ],
        "ai_risk": False,
        "ai_risk_reason": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await tasks.insert_one(task_dict)
    task_dict["_id"] = str(result.inserted_id)
    assignee_names = await fetch_user_names(task_data.assignee_ids or [])
    collaborator_names = await fetch_user_names(task_data.collaborator_ids or [])
    details = []
    if assignee_names:
        details.append(f"assigned to {', '.join(assignee_names)}")
    if collaborator_names:
        details.append(f"collaborators {', '.join(collaborator_names)}")
    detail_suffix = f" ({', '.join(details)})" if details else ""
    project_description = f"Task \"{task_data.title}\" created by {current_user.get('name', 'Unknown')}{detail_suffix}"
    await push_project_activity(
        project.get("_id") or task_data.project_id,
        [build_activity_entry(project_description, current_user)]
    )
    return await populate_task(task_dict)


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    task_data: TaskUpdate,
    current_user: dict = Depends(get_current_user)
):
    tasks = get_tasks_collection()

    existing = await tasks.find_one({"_id": ObjectId(task_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")

    incoming = {k: v for k, v in task_data.dict().items() if v is not None}
    if not incoming:
        raise HTTPException(status_code=400, detail="No data to update")

    def normalize_datetime(value):
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.replace(microsecond=0)
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(microsecond=0)
            except ValueError:
                return value
        return value

    def normalize_enum(value):
        return value.value if hasattr(value, "value") else value

    actor_name = current_user.get("name", "Unknown")
    activity_entries = []
    project_activity_entries = []
    update_data = {}
    task_title = incoming.get("title") or existing.get("title") or "Task"

    def add_activity(description):
        activity_entries.append(build_activity_entry(description, current_user))

    def add_project_activity(description):
        project_activity_entries.append(build_activity_entry(description, current_user))

    # Status
    if "status" in incoming:
        new_status = normalize_status(normalize_enum(incoming["status"]))
        if not is_forward_status(existing.get("status"), new_status):
            raise HTTPException(status_code=400, detail="Cannot move task back to a previous stage")
        if existing.get("status") != new_status:
            update_data["status"] = new_status
            if new_status == "completed":
                update_data["completed_at"] = datetime.utcnow()
            add_activity(f"Status changed to {new_status} by {actor_name}")
            add_project_activity(f"Task \"{task_title}\" status changed to {new_status} by {actor_name}")

    # Priority
    if "priority" in incoming:
        new_priority = normalize_enum(incoming["priority"])
        if existing.get("priority") != new_priority:
            update_data["priority"] = new_priority
            add_activity(f"Priority changed to {new_priority} by {actor_name}")
            add_project_activity(f"Task \"{task_title}\" priority changed to {new_priority} by {actor_name}")

    # Text fields
    if "title" in incoming and existing.get("title") != incoming["title"]:
        update_data["title"] = incoming["title"]
        add_activity(f"Task title updated by {actor_name}")
        add_project_activity(f"Task title updated to \"{incoming['title']}\" by {actor_name}")
    if "description" in incoming and existing.get("description") != incoming["description"]:
        update_data["description"] = incoming["description"]
        add_activity(f"Task description updated by {actor_name}")
        add_project_activity(f"Task \"{task_title}\" description updated by {actor_name}")

    # Date fields
    if "assigned_date" in incoming:
        existing_assigned = normalize_datetime(existing.get("assigned_date"))
        incoming_assigned = normalize_datetime(incoming["assigned_date"])
        if existing_assigned != incoming_assigned:
            update_data["assigned_date"] = incoming["assigned_date"]
            add_activity(f"Assigned date updated by {actor_name}")
            add_project_activity(f"Task \"{task_title}\" assigned date updated by {actor_name}")
    if "due_date" in incoming:
        existing_due = normalize_datetime(existing.get("due_date"))
        incoming_due = normalize_datetime(incoming["due_date"])
        if existing_due != incoming_due:
            update_data["due_date"] = incoming["due_date"]
            add_activity(f"Due date updated by {actor_name}")
            add_project_activity(f"Task \"{task_title}\" due date updated by {actor_name}")

    # Assignees/collaborators
    if "assignee_ids" in incoming:
        existing_assignees = set(existing.get("assignee_ids", []))
        incoming_assignees = set(incoming["assignee_ids"] or [])
        if existing_assignees != incoming_assignees:
            update_data["assignee_ids"] = list(incoming["assignee_ids"] or [])
            add_activity(f"Assignees updated by {actor_name}")
            added_assignees = list(incoming_assignees - existing_assignees)
            removed_assignees = list(existing_assignees - incoming_assignees)
            assignee_logged = False
            if added_assignees:
                added_names = await fetch_user_names(added_assignees)
                if added_names:
                    add_project_activity(
                        f"Task \"{task_title}\" assigned to {', '.join(added_names)} by {actor_name}"
                    )
                    assignee_logged = True
            if removed_assignees:
                removed_names = await fetch_user_names(removed_assignees)
                if removed_names:
                    add_project_activity(
                        f"Task \"{task_title}\" unassigned from {', '.join(removed_names)} by {actor_name}"
                    )
                    assignee_logged = True
            if not assignee_logged:
                add_project_activity(f"Task \"{task_title}\" assignees updated by {actor_name}")

    if "collaborator_ids" in incoming:
        existing_collabs = set(existing.get("collaborator_ids", []))
        incoming_collabs = set(incoming["collaborator_ids"] or [])
        if existing_collabs != incoming_collabs:
            update_data["collaborator_ids"] = list(incoming["collaborator_ids"] or [])
            add_activity(f"Collaborators updated by {actor_name}")
            added_collabs = list(incoming_collabs - existing_collabs)
            removed_collabs = list(existing_collabs - incoming_collabs)
            collaborator_logged = False
            if added_collabs:
                added_names = await fetch_user_names(added_collabs)
                if added_names:
                    add_project_activity(
                        f"Task \"{task_title}\" collaborators added: {', '.join(added_names)} by {actor_name}"
                    )
                    collaborator_logged = True
            if removed_collabs:
                removed_names = await fetch_user_names(removed_collabs)
                if removed_names:
                    add_project_activity(
                        f"Task \"{task_title}\" collaborators removed: {', '.join(removed_names)} by {actor_name}"
                    )
                    collaborator_logged = True
            if not collaborator_logged:
                add_project_activity(f"Task \"{task_title}\" collaborators updated by {actor_name}")

    # Goals & achievements
    if "weekly_goals" in incoming and existing.get("weekly_goals") != incoming["weekly_goals"]:
        update_data["weekly_goals"] = incoming["weekly_goals"]
        add_activity(f"Task goals updated by {actor_name}")
        add_project_activity(f"Task \"{task_title}\" goals updated by {actor_name}")
    if "weekly_achievements" in incoming and existing.get("weekly_achievements") != incoming["weekly_achievements"]:
        update_data["weekly_achievements"] = incoming["weekly_achievements"]
        add_activity(f"Task achievements updated by {actor_name}")
        add_project_activity(f"Task \"{task_title}\" achievements updated by {actor_name}")

    if not update_data:
        return await populate_task(existing)

    update_data["updated_at"] = datetime.utcnow()
    update_payload = {"$set": update_data}
    if activity_entries:
        update_payload["$push"] = {"activity": {"$each": activity_entries}}

    await tasks.update_one({"_id": ObjectId(task_id)}, update_payload)
    if project_activity_entries:
        await push_project_activity(existing.get("project_id"), project_activity_entries)
    task = await tasks.find_one({"_id": ObjectId(task_id)})
    return await populate_task(task)


@router.put("/{task_id}/status")
async def update_task_status(
    task_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    tasks = get_tasks_collection()
    new_status = normalize_status(data.get("status"))

    existing = await tasks.find_one({"_id": ObjectId(task_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    current_status = normalize_status(existing.get("status"))
    if current_status == new_status:
        return await populate_task(existing)
    if not is_forward_status(current_status, new_status):
        raise HTTPException(status_code=400, detail="Cannot move task back to a previous stage")
    
    update_data = {"status": new_status, "updated_at": datetime.utcnow()}
    if new_status == "completed":
        update_data["completed_at"] = datetime.utcnow()
    
    activity = build_activity_entry(
        f"Status changed to {new_status} by {current_user.get('name', 'Unknown')}",
        current_user
    )
    
    await tasks.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$set": update_data,
            "$push": {"activity": activity}
        }
    )

    project_description = (
        f"Task \"{existing.get('title', 'Task')}\" status changed to {new_status} "
        f"by {current_user.get('name', 'Unknown')}"
    )
    await push_project_activity(
        existing.get("project_id"),
        [build_activity_entry(project_description, current_user)]
    )

    task = await tasks.find_one({"_id": ObjectId(task_id)})

    # Check if project should be auto-completed
    await check_project_auto_complete(task["project_id"])
    
    return await populate_task(task)


@router.put("/{task_id}/priority")
async def update_task_priority(
    task_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    tasks = get_tasks_collection()
    projects = get_projects_collection()
    new_priority = data.get("priority")

    existing = await tasks.find_one({"_id": ObjectId(task_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    if existing.get("priority") == new_priority:
        return await populate_task(existing)
    
    activity = build_activity_entry(
        f"Priority changed to {new_priority} by {current_user.get('name', 'Unknown')}",
        current_user
    )
    
    await tasks.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$set": {"priority": new_priority, "updated_at": datetime.utcnow()},
            "$push": {"activity": activity}
        }
    )

    project_description = (
        f"Task \"{existing.get('title', 'Task')}\" priority changed to {new_priority} "
        f"by {current_user.get('name', 'Unknown')}"
    )
    await push_project_activity(
        existing.get("project_id"),
        [build_activity_entry(project_description, current_user)]
    )

    task = await tasks.find_one({"_id": ObjectId(task_id)})
    return await populate_task(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    tasks = get_tasks_collection()
    comments = get_comments_collection()
    
    # Delete comments
    await comments.delete_many({"task_id": task_id})
    
    result = await tasks.delete_one({"_id": ObjectId(task_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {"message": "Task deleted"}


@router.put("/{task_id}/achievements")
async def update_task_achievements(
    task_id: str,
    achievements: List[dict],
    current_user: dict = Depends(get_current_user)
):
    tasks = get_tasks_collection()
    projects = get_projects_collection()

    existing = await tasks.find_one({"_id": ObjectId(task_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")

    if existing.get("weekly_achievements") != achievements:
        activity = {
            "description": f"Task achievements updated by {current_user.get('name', 'Unknown')}",
            "timestamp": activity_timestamp(),
            "user_id": current_user["_id"],
            "user": current_user.get("name", "Unknown")
        }
        await tasks.update_one(
            {"_id": ObjectId(task_id)},
            {
                "$set": {"weekly_achievements": achievements, "updated_at": datetime.utcnow()},
                "$push": {"activity": activity}
            }
        )
        description = (
            f"Task \"{existing.get('title', 'Task')}\" achievements updated by "
            f"{current_user.get('name', 'Unknown')}"
        )
        await push_project_activity(
            existing.get("project_id"),
            [build_activity_entry(description, current_user)]
        )
    task = await tasks.find_one({"_id": ObjectId(task_id)})
    return await populate_task(task)


# Comments
@router.get("/{task_id}/comments")
async def get_task_comments(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    comments = get_comments_collection()
    users = get_users_collection()
    
    cursor = comments.find({"task_id": task_id}).sort("created_at", 1)
    
    result = []
    async for comment in cursor:
        comment["_id"] = str(comment["_id"])
        
        # Get user
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


@router.post("/{task_id}/comments")
async def add_task_comment(
    task_id: str,
    comment_data: CommentCreate,
    current_user: dict = Depends(get_current_user)
):
    comments = get_comments_collection()
    tasks = get_tasks_collection()
    users = get_users_collection()
    
    # Verify task exists
    task = await tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    comment_dict = {
        "content": comment_data.content,
        "task_id": task_id,
        "user_id": current_user["_id"],
        "attachments": [att.dict() for att in comment_data.attachments] if comment_data.attachments else [],
        "created_at": datetime.utcnow()
    }
    
    result = await comments.insert_one(comment_dict)
    comment_dict["_id"] = str(result.inserted_id)
    
    # Add user info
    user = await users.find_one({"_id": ObjectId(current_user["_id"])}, {"password": 0})
    if user:
        user["_id"] = str(user["_id"])
        comment_dict["user"] = user
    
    # Add activity to task
    activity = {
        "description": f"{current_user['name']} added a comment",
        "timestamp": activity_timestamp(),
        "user_id": current_user["_id"],
        "user": current_user.get("name", "Unknown")
    }
    await tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$push": {"activity": activity}}
    )
    
    return comment_dict


@router.put("/{task_id}/goals")
async def update_task_goals(
    task_id: str,
    goals: List[dict],
    current_user: dict = Depends(get_current_user)
):
    """Update weekly goals for a task"""
    tasks = get_tasks_collection()

    existing = await tasks.find_one({"_id": ObjectId(task_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")

    if existing.get("weekly_goals") != goals:
        activity = {
            "description": f"Task goals updated by {current_user.get('name', 'Unknown')}",
            "timestamp": activity_timestamp(),
            "user_id": current_user["_id"],
            "user": current_user.get("name", "Unknown")
        }
        await tasks.update_one(
            {"_id": ObjectId(task_id)},
            {
                "$set": {"weekly_goals": goals, "updated_at": datetime.utcnow()},
                "$push": {"activity": activity}
            }
        )
        description = (
            f"Task \"{existing.get('title', 'Task')}\" goals updated by "
            f"{current_user.get('name', 'Unknown')}"
        )
        await push_project_activity(
            existing.get("project_id"),
            [build_activity_entry(description, current_user)]
        )
    task = await tasks.find_one({"_id": ObjectId(task_id)})
    return await populate_task(task)


@router.post("/{task_id}/attachments")
async def add_task_attachment(
    task_id: str,
    attachment: dict,
    current_user: dict = Depends(get_current_user)
):
    """Add attachment to a task"""
    tasks = get_tasks_collection()
    
    attachment_data = {
        "id": str(ObjectId()),
        "filename": attachment.get("filename"),
        "url": attachment.get("url"),
        "type": attachment.get("type", "file"),
        "uploaded_by": current_user["_id"],
        "uploaded_at": datetime.utcnow().isoformat()
    }

    activity = {
        "description": f"Attachment added by {current_user.get('name', 'Unknown')}",
        "timestamp": activity_timestamp(),
        "user_id": current_user["_id"],
        "user": current_user.get("name", "Unknown")
    }
    
    await tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$push": {"attachments": attachment_data, "activity": activity}}
    )
    
    task = await tasks.find_one({"_id": ObjectId(task_id)})
    return await populate_task(task)


@router.delete("/{task_id}/attachments/{attachment_id}")
async def delete_task_attachment(
    task_id: str,
    attachment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete attachment from a task"""
    tasks = get_tasks_collection()

    activity = {
        "description": f"Attachment removed by {current_user.get('name', 'Unknown')}",
        "timestamp": activity_timestamp(),
        "user_id": current_user["_id"],
        "user": current_user.get("name", "Unknown")
    }

    await tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$pull": {"attachments": {"id": attachment_id}}, "$push": {"activity": activity}}
    )
    
    task = await tasks.find_one({"_id": ObjectId(task_id)})
    return await populate_task(task)
