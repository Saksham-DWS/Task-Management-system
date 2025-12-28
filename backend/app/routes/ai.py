from fastapi import APIRouter, Depends
from typing import List

from ..database import get_tasks_collection, get_projects_collection
from ..services.auth import get_current_user
from ..services.ai import generate_task_insights, get_ai_recommendations

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
    
    projects = get_projects_collection()
    tasks = get_tasks_collection()
    
    project = await projects.find_one({"_id": __import__("bson").ObjectId(project_id)})
    if not project:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")
    
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
    
    return {
        "health_score": health_score,
        "goals_analysis": goals_analysis,
        "task_insights": task_insights,
        "task_count": len(task_list),
        "completed_count": len([t for t in task_list if t.get("status") == "completed"]),
        "blocked_count": len([t for t in task_list if t.get("status") in ["blocked", "on_hold"]])
    }
