from fastapi import APIRouter, Depends
from datetime import datetime
from typing import List
from pydantic import BaseModel, Field

from ..database import get_tasks_collection, get_projects_collection, get_ai_insights_collection, get_groups_collection
from ..services.auth import get_current_user, require_role
from ..services.ai import generate_task_insights, get_ai_recommendations, generate_admin_filter_insights
from ..services.ai_scheduler import generate_project_insight, generate_admin_insight, serialize_insight, schedule_project_insight


def _normalize_id_list(ids):
    if not ids:
        return []
    normalized = []
    for value in ids:
        if value is None:
            continue
        normalized.append(str(value))
    return list(dict.fromkeys(normalized))

def _normalize_str(value) -> str:
    return str(value) if value is not None else ""

def _project_sort_key(project: dict):
    for key in ["updated_at", "updatedAt", "created_at", "createdAt"]:
        value = project.get(key)
        if not value:
            continue
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            continue
    return datetime.min

def _trim_manager_scope(
    scoped_groups: list,
    scoped_projects: list,
    scoped_tasks: list,
    scoped_users: list | None,
    scoped_comments: list | None,
    limit: int = 5
) -> tuple[list, list, list, list | None, list | None]:
    if not scoped_projects:
        return scoped_groups, scoped_projects, scoped_tasks, scoped_users, scoped_comments
    trimmed_projects = sorted(scoped_projects, key=_project_sort_key, reverse=True)[:limit]
    trimmed_project_ids = {_normalize_str(project.get("_id")) for project in trimmed_projects if project.get("_id")}
    trimmed_tasks = [
        task for task in scoped_tasks
        if _normalize_str(task.get("project_id")) in trimmed_project_ids
    ]
    trimmed_task_ids = {_normalize_str(task.get("_id")) for task in trimmed_tasks if task.get("_id")}
    trimmed_group_ids = {
        _normalize_str(project.get("group_id"))
        for project in trimmed_projects
        if project.get("group_id")
    }
    trimmed_groups = [
        group for group in scoped_groups
        if _normalize_str(group.get("_id")) in trimmed_group_ids
    ]
    trimmed_comments = scoped_comments
    if scoped_comments is not None:
        trimmed_comments = []
        for comment in scoped_comments:
            task_id = _normalize_str(comment.get("task_id") or comment.get("taskId"))
            project_id = _normalize_str(comment.get("project_id") or comment.get("projectId"))
            if task_id and task_id in trimmed_task_ids:
                trimmed_comments.append(comment)
                continue
            if project_id and project_id in trimmed_project_ids:
                trimmed_comments.append(comment)
    trimmed_users = scoped_users
    if scoped_users is not None:
        user_ids = set()
        for project in trimmed_projects:
            owner_id = _normalize_str(project.get("owner_id"))
            if owner_id:
                user_ids.add(owner_id)
            user_ids.update(_normalize_id_list(project.get("access_user_ids") or project.get("accessUserIds") or []))
            user_ids.update(_normalize_id_list(project.get("collaborator_ids") or project.get("collaboratorIds") or []))
        for task in trimmed_tasks:
            assigned_by = _normalize_str(task.get("assigned_by_id"))
            if assigned_by:
                user_ids.add(assigned_by)
            user_ids.update(_normalize_id_list(task.get("assignee_ids") or []))
            user_ids.update(_normalize_id_list(task.get("collaborator_ids") or []))
        for entry in scoped_users:
            access = entry.get("access", {}) or {}
            group_ids = _normalize_id_list(access.get("group_ids") or access.get("groupIds") or [])
            project_ids = _normalize_id_list(access.get("project_ids") or access.get("projectIds") or [])
            if any(gid in trimmed_group_ids for gid in group_ids):
                user_ids.add(_normalize_str(entry.get("_id") or entry.get("id")))
            if any(pid in trimmed_project_ids for pid in project_ids):
                user_ids.add(_normalize_str(entry.get("_id") or entry.get("id")))
        trimmed_users = [
            user for user in scoped_users
            if _normalize_str(user.get("_id") or user.get("id")) in user_ids
        ]
    return trimmed_groups, trimmed_projects, trimmed_tasks, trimmed_users, trimmed_comments

def _filter_manager_scope(
    current_user: dict,
    groups: list,
    projects: list,
    tasks: list,
    users: list | None = None,
    comments: list | None = None
) -> tuple[list, list, list, list | None, list | None]:
    user_id = _normalize_str(current_user.get("_id"))
    access = current_user.get("access", {}) or {}
    group_ids = set(_normalize_id_list(access.get("group_ids", [])))
    project_ids = set(_normalize_id_list(access.get("project_ids", [])))

    for group in groups:
        if _normalize_str(group.get("owner_id")) == user_id:
            group_ids.add(_normalize_str(group.get("_id")))

    accessible_project_ids = set()
    for project in projects:
        pid = _normalize_str(project.get("_id"))
        group_id = _normalize_str(project.get("group_id"))
        access_user_ids = _normalize_id_list(project.get("access_user_ids") or project.get("accessUserIds") or [])
        collaborator_ids = _normalize_id_list(project.get("collaborator_ids") or project.get("collaboratorIds") or [])
        if pid in project_ids or group_id in group_ids:
            accessible_project_ids.add(pid)
        if _normalize_str(project.get("owner_id")) == user_id:
            accessible_project_ids.add(pid)
        if user_id in access_user_ids or user_id in collaborator_ids:
            accessible_project_ids.add(pid)

    for task in tasks:
        if not task:
            continue
        task_project_id = _normalize_str(task.get("project_id"))
        if not task_project_id:
            continue
        assignees = _normalize_id_list(task.get("assignee_ids") or [])
        collaborators = _normalize_id_list(task.get("collaborator_ids") or [])
        if _normalize_str(task.get("assigned_by_id")) == user_id:
            accessible_project_ids.add(task_project_id)
        if user_id in assignees or user_id in collaborators:
            accessible_project_ids.add(task_project_id)

    for project in projects:
        if _normalize_str(project.get("_id")) in accessible_project_ids:
            group_id = _normalize_str(project.get("group_id"))
            if group_id:
                group_ids.add(group_id)

    scoped_groups = [g for g in groups if _normalize_str(g.get("_id")) in group_ids]
    scoped_projects = [p for p in projects if _normalize_str(p.get("_id")) in accessible_project_ids]
    scoped_tasks = [t for t in tasks if _normalize_str(t.get("project_id")) in accessible_project_ids]

    scoped_users = None
    if users is not None:
        user_ids = set()
        for project in scoped_projects:
            owner_id = _normalize_str(project.get("owner_id"))
            if owner_id:
                user_ids.add(owner_id)
            user_ids.update(_normalize_id_list(project.get("access_user_ids") or project.get("accessUserIds") or []))
            user_ids.update(_normalize_id_list(project.get("collaborator_ids") or project.get("collaboratorIds") or []))
        for task in scoped_tasks:
            assigned_by = _normalize_str(task.get("assigned_by_id"))
            if assigned_by:
                user_ids.add(assigned_by)
            user_ids.update(_normalize_id_list(task.get("assignee_ids") or []))
            user_ids.update(_normalize_id_list(task.get("collaborator_ids") or []))
        scoped_group_ids = {_normalize_str(group.get("_id")) for group in scoped_groups}
        scoped_project_ids = {_normalize_str(project.get("_id")) for project in scoped_projects}
        for entry in users:
            access = entry.get("access", {}) or {}
            group_ids = _normalize_id_list(access.get("group_ids") or access.get("groupIds") or [])
            project_ids = _normalize_id_list(access.get("project_ids") or access.get("projectIds") or [])
            if any(gid in scoped_group_ids for gid in group_ids):
                user_ids.add(_normalize_str(entry.get("_id") or entry.get("id")))
            if any(pid in scoped_project_ids for pid in project_ids):
                user_ids.add(_normalize_str(entry.get("_id") or entry.get("id")))
        scoped_users = [
            user for user in users
            if _normalize_str(user.get("_id") or user.get("id")) in user_ids
        ]

    scoped_comments = None
    if comments is not None:
        task_ids = {_normalize_str(task.get("_id")) for task in scoped_tasks if task.get("_id")}
        project_ids = {_normalize_str(project.get("_id")) for project in scoped_projects if project.get("_id")}
        scoped_comments = []
        for comment in comments:
            task_id = _normalize_str(comment.get("task_id") or comment.get("taskId"))
            project_id = _normalize_str(comment.get("project_id") or comment.get("projectId"))
            if task_id and task_id in task_ids:
                scoped_comments.append(comment)
                continue
            if project_id and project_id in project_ids:
                scoped_comments.append(comment)
        # Keep ordering stable

    return scoped_groups, scoped_projects, scoped_tasks, scoped_users, scoped_comments


def _manager_default_filters(scoped_groups: list, scoped_projects: list, scoped_users: list | None) -> dict:
    return {
        "groupIds": [],
        "projectIds": [],
        "userIds": []
    }


def _has_project_access(current_user: dict, project: dict) -> bool:
    role = current_user.get("role", "user")
    if role in ["admin", "super_admin"]:
        return True
    current_user_id = str(current_user.get("_id"))
    access = current_user.get("access", {}) or {}
    group_id = str(project.get("group_id") or "")
    if group_id in access.get("group_ids", []):
        return True
    if str(project.get("_id")) in access.get("project_ids", []):
        return True
    if str(project.get("owner_id")) == current_user_id:
        return True
    if current_user_id in _normalize_id_list(project.get("collaborator_ids")):
        return True
    if current_user_id in _normalize_id_list(project.get("access_user_ids")):
        return True
    return False

router = APIRouter(prefix="/api/ai", tags=["AI"])


class AdminInsightFilters(BaseModel):
    group_ids: List[str] = Field(default_factory=list, alias="groupIds")
    project_ids: List[str] = Field(default_factory=list, alias="projectIds")
    user_ids: List[str] = Field(default_factory=list, alias="userIds")

    class Config:
        populate_by_name = True


@router.get("/insights")
async def get_insights(current_user: dict = Depends(get_current_user)):
    tasks = get_tasks_collection()
    user_id = current_user["_id"]
    
    # Get user's tasks
    cursor = tasks.find({
        "$or": [
            {"assignee_ids": user_id},
            {"collaborator_ids": user_id},
            {"assigned_by_id": user_id}
        ]
    })
    
    task_list = []
    async for task in cursor:
        task["_id"] = str(task["_id"])
        task_list.append(task)
    
    insights = await generate_task_insights(task_list)
    return {"insights": insights}


@router.get("/insights/overall")
async def get_overall_insights(current_user: dict = Depends(get_current_user)):
    tasks = get_tasks_collection()
    projects = get_projects_collection()
    
    # Get all tasks
    task_list = []
    async for task in tasks.find({}):
        task["_id"] = str(task["_id"])
        task_list.append(task)
    
    # Get all projects
    project_list = []
    async for project in projects.find({}):
        project["_id"] = str(project["_id"])
        project_list.append(project)
    
    insights = await generate_task_insights(task_list)
    recommendations = await get_ai_recommendations({
        "tasks": task_list,
        "projects": project_list
    })
    
    return {
        "insights": insights,
        "recommendations": recommendations
    }


@router.get("/recommendations")
async def get_recommendations(current_user: dict = Depends(get_current_user)):
    tasks = get_tasks_collection()
    projects = get_projects_collection()
    
    task_list = []
    async for task in tasks.find({}):
        task["_id"] = str(task["_id"])
        task_list.append(task)
    
    project_list = []
    async for project in projects.find({}):
        project["_id"] = str(project["_id"])
        project_list.append(project)
    
    recommendations = await get_ai_recommendations({
        "tasks": task_list,
        "projects": project_list
    })
    
    return {"recommendations": recommendations}



@router.post("/analyze-goals")
async def analyze_goals(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Analyze goals vs achievements for a project or task"""
    from ..services.ai import analyze_goals_vs_achievements
    
    goals = data.get("goals", [])
    achievements = data.get("achievements", [])
    
    analysis = await analyze_goals_vs_achievements(goals, achievements)
    return analysis


@router.get("/team-insights")
async def get_team_insights(current_user: dict = Depends(get_current_user)):
    """Get AI insights about team workload and performance"""
    from ..database import get_users_collection
    from ..services.ai import generate_team_insights
    
    tasks = get_tasks_collection()
    users = get_users_collection()
    
    task_list = []
    async for task in tasks.find({}):
        task["_id"] = str(task["_id"])
        task_list.append(task)
    
    user_list = []
    async for user in users.find({}, {"password": 0}):
        user["_id"] = str(user["_id"])
        user_list.append(user)
    
    insights = await generate_team_insights(user_list, task_list)
    return {"insights": insights}


@router.get("/project/{project_id}/insights")
async def get_project_insights(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get AI insights for a specific project"""
    from ..services.ai import generate_project_health, analyze_goals_vs_achievements
    from bson import ObjectId
    
    projects = get_projects_collection()
    tasks = get_tasks_collection()
    insights = get_ai_insights_collection()
    
    project = await projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")
    if not _has_project_access(current_user, project):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not authorized to view this project")
    
    # Get project tasks
    task_list = []
    async for task in tasks.find({"project_id": project_id}):
        task["_id"] = str(task["_id"])
        task_list.append(task)
    
    # Calculate health score
    health_score = await generate_project_health(project, task_list)
    
    # Analyze goals vs achievements
    goals_analysis = await analyze_goals_vs_achievements(
        project.get("weekly_goals", []),
        project.get("weekly_achievements", [])
    )
    
    # Generate task insights
    task_insights = await generate_task_insights(task_list)

    ai_doc = await insights.find_one({"scope": "project", "project_id": project_id})
    
    return {
        "health_score": health_score,
        "goals_analysis": goals_analysis,
        "task_insights": task_insights,
        "task_count": len(task_list),
        "completed_count": len([t for t in task_list if t.get("status") == "completed"]),
        "blocked_count": len([t for t in task_list if t.get("status") in ["blocked", "on_hold", "hold"]]),
        "ai_insight": serialize_insight(ai_doc)
    }


@router.get("/projects/{project_id}/insights")
async def get_project_ai_insights(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    insights = get_ai_insights_collection()
    from bson import ObjectId

    project = await projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")
    if not _has_project_access(current_user, project):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not authorized to view this project")

    await schedule_project_insight(project_id, project.get("created_at"))
    doc = await insights.find_one({"scope": "project", "project_id": project_id})
    return {"insight": serialize_insight(doc)}


@router.post("/projects/{project_id}/generate")
async def generate_project_ai(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    projects = get_projects_collection()
    from bson import ObjectId

    project = await projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")
    if not _has_project_access(current_user, project):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not authorized to generate insights for this project")

    payload = await generate_project_insight(
        project_id,
        triggered_by=str(current_user.get("_id")),
        force_refresh=True
    )
    return {"insight": serialize_insight(payload)}


@router.get("/admin/insights")
async def get_admin_insights(
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    if current_user.get("role") == "manager":
        groups = get_groups_collection()
        projects = get_projects_collection()
        tasks = get_tasks_collection()
        from ..database import get_users_collection, get_comments_collection
        users = get_users_collection()
        comments = get_comments_collection()

        group_list = [group async for group in groups.find({})]
        project_list = [project async for project in projects.find({})]
        task_list = [task async for task in tasks.find({})]
        user_list = [user async for user in users.find({}, {"password": 0})]
        comment_list = [comment async for comment in comments.find({})]

        scoped_groups, scoped_projects, scoped_tasks, scoped_users, scoped_comments = _filter_manager_scope(
            current_user,
            group_list,
            project_list,
            task_list,
            user_list,
            comment_list
        )
        scoped_groups, scoped_projects, scoped_tasks, scoped_users, scoped_comments = _trim_manager_scope(
            scoped_groups,
            scoped_projects,
            scoped_tasks,
            scoped_users,
            scoped_comments
        )
        default_filters = _manager_default_filters(scoped_groups, scoped_projects, scoped_users)
        insight = await generate_admin_filter_insights(
            scoped_groups,
            scoped_projects,
            scoped_tasks,
            scoped_users or [],
            default_filters,
            scoped_comments or []
        )
        return {"insight": insight}

    insights = get_ai_insights_collection()
    doc = await insights.find_one({"scope": "admin"})
    return {"insight": serialize_insight(doc)}


@router.post("/admin/generate")
async def generate_admin_ai(
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    if current_user.get("role") == "manager":
        groups = get_groups_collection()
        projects = get_projects_collection()
        tasks = get_tasks_collection()
        from ..database import get_users_collection, get_comments_collection
        users = get_users_collection()
        comments = get_comments_collection()

        group_list = [group async for group in groups.find({})]
        project_list = [project async for project in projects.find({})]
        task_list = [task async for task in tasks.find({})]
        user_list = [user async for user in users.find({}, {"password": 0})]
        comment_list = [comment async for comment in comments.find({})]

        scoped_groups, scoped_projects, scoped_tasks, scoped_users, scoped_comments = _filter_manager_scope(
            current_user,
            group_list,
            project_list,
            task_list,
            user_list,
            comment_list
        )
        scoped_groups, scoped_projects, scoped_tasks, scoped_users, scoped_comments = _trim_manager_scope(
            scoped_groups,
            scoped_projects,
            scoped_tasks,
            scoped_users,
            scoped_comments
        )
        default_filters = _manager_default_filters(scoped_groups, scoped_projects, scoped_users)
        insight = await generate_admin_filter_insights(
            scoped_groups,
            scoped_projects,
            scoped_tasks,
            scoped_users or [],
            default_filters,
            scoped_comments or []
        )
        return {"insight": insight}

    payload = await generate_admin_insight(
        triggered_by=str(current_user.get("_id")),
        force_refresh=True
    )
    return {"insight": serialize_insight(payload)}


@router.post("/admin/insights/filters")
async def get_filtered_admin_insights(
    filters: AdminInsightFilters,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    from ..database import get_groups_collection, get_users_collection, get_comments_collection

    groups = get_groups_collection()
    projects = get_projects_collection()
    tasks = get_tasks_collection()
    users = get_users_collection()
    comments = get_comments_collection()

    group_list = [group async for group in groups.find({})]
    project_list = [project async for project in projects.find({})]
    task_list = [task async for task in tasks.find({})]
    user_list = [user async for user in users.find({}, {"password": 0})]
    comment_list = [comment async for comment in comments.find({})]

    filter_payload = filters.model_dump(by_alias=True)

    if current_user.get("role") == "manager":
        scoped_groups, scoped_projects, scoped_tasks, scoped_users, scoped_comments = _filter_manager_scope(
            current_user,
            group_list,
            project_list,
            task_list,
            user_list,
            comment_list
        )
        allowed_group_ids = {_normalize_str(g.get("_id")) for g in scoped_groups}
        allowed_project_ids = {_normalize_str(p.get("_id")) for p in scoped_projects}
        allowed_user_ids = {_normalize_str(u.get("_id") or u.get("id")) for u in (scoped_users or [])}

        filter_payload["groupIds"] = [
            gid for gid in filter_payload.get("groupIds", []) if _normalize_str(gid) in allowed_group_ids
        ]
        filter_payload["projectIds"] = [
            pid for pid in filter_payload.get("projectIds", []) if _normalize_str(pid) in allowed_project_ids
        ]
        filter_payload["userIds"] = [
            uid for uid in filter_payload.get("userIds", []) if _normalize_str(uid) in allowed_user_ids
        ]
        if not filter_payload.get("groupIds") and not filter_payload.get("projectIds") and not filter_payload.get("userIds"):
            scoped_groups, scoped_projects, scoped_tasks, scoped_users, scoped_comments = _trim_manager_scope(
                scoped_groups,
                scoped_projects,
                scoped_tasks,
                scoped_users,
                scoped_comments
            )
            filter_payload = _manager_default_filters(scoped_groups, scoped_projects, scoped_users)

        insight = await generate_admin_filter_insights(
            scoped_groups,
            scoped_projects,
            scoped_tasks,
            scoped_users or [],
            filter_payload,
            scoped_comments or []
        )
    else:
        insight = await generate_admin_filter_insights(
            group_list,
            project_list,
            task_list,
            user_list,
            filter_payload,
            comment_list
        )
    return {"insight": insight}
