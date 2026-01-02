from fastapi import APIRouter, Depends
from typing import List

from ..database import get_tasks_collection, get_projects_collection, get_ai_insights_collection
from ..services.auth import get_current_user, require_role
from ..services.ai import generate_task_insights, get_ai_recommendations
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


def _has_project_access(current_user: dict, project: dict) -> bool:
    role = current_user.get("role", "user")
    if role in ["admin", "manager"]:
        return True
    current_user_id = str(current_user.get("_id"))
    access = current_user.get("access", {}) or {}
    category_id = str(project.get("category_id") or "")
    if category_id in access.get("category_ids", []):
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
    insights = get_ai_insights_collection()
    doc = await insights.find_one({"scope": "admin"})
    return {"insight": serialize_insight(doc)}


@router.post("/admin/generate")
async def generate_admin_ai(
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    payload = await generate_admin_insight(
        triggered_by=str(current_user.get("_id")),
        force_refresh=True
    )
    return {"insight": serialize_insight(payload)}
