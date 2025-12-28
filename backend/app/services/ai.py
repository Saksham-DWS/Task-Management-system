from typing import List, Dict, Any
from datetime import datetime, timedelta
import os

# Try to import OpenAI, but make it optional
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

from ..config import settings


def get_openai_client():
    if not OPENAI_AVAILABLE:
        return None
    if not settings.openai_api_key:
        return None
    return OpenAI(api_key=settings.openai_api_key)


async def generate_task_insights(tasks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Generate AI insights based on tasks"""
    insights = []
    
    # Calculate basic metrics
    total_tasks = len(tasks)
    if total_tasks == 0:
        return [{"type": "info", "message": "No tasks to analyze yet."}]
    
    overdue_tasks = [t for t in tasks if t.get("due_date") and 
                    datetime.fromisoformat(str(t["due_date"]).replace("Z", "")) < datetime.utcnow() and 
                    t.get("status") != "completed"]
    
    blocked_tasks = [t for t in tasks if t.get("status") == "blocked"]
    high_priority = [t for t in tasks if t.get("priority") == "high" and t.get("status") != "completed"]
    completed_tasks = [t for t in tasks if t.get("status") == "completed"]
    
    # Generate insights
    if len(overdue_tasks) > 0:
        insights.append({
            "type": "warning",
            "title": "Overdue Tasks",
            "message": f"You have {len(overdue_tasks)} overdue task{'s' if len(overdue_tasks) > 1 else ''} that need immediate attention."
        })
    
    if len(blocked_tasks) > 0:
        insights.append({
            "type": "negative",
            "title": "Blocked Tasks",
            "message": f"{len(blocked_tasks)} task{'s are' if len(blocked_tasks) > 1 else ' is'} currently blocked. Review and resolve blockers."
        })
    
    if len(high_priority) > 0:
        insights.append({
            "type": "insight",
            "title": "High Priority",
            "message": f"{len(high_priority)} high priority task{'s' if len(high_priority) > 1 else ''} pending completion."
        })
    
    completion_rate = (len(completed_tasks) / total_tasks) * 100 if total_tasks > 0 else 0
    if completion_rate >= 70:
        insights.append({
            "type": "positive",
            "title": "Great Progress",
            "message": f"Excellent! {completion_rate:.0f}% of tasks completed. Keep up the momentum!"
        })
    elif completion_rate >= 40:
        insights.append({
            "type": "insight",
            "title": "Making Progress",
            "message": f"{completion_rate:.0f}% of tasks completed. Focus on high priority items to improve velocity."
        })
    
    if len(insights) == 0:
        insights.append({
            "type": "success",
            "title": "All Clear",
            "message": "No urgent items. Great job staying on top of your work!"
        })
    
    return insights


async def generate_project_health(project: Dict[str, Any], tasks: List[Dict[str, Any]]) -> int:
    """Calculate project health score (0-100)"""
    if not tasks:
        return 50  # Default score for projects with no tasks
    
    total_tasks = len(tasks)
    completed = len([t for t in tasks if t.get("status") == "completed"])
    blocked = len([t for t in tasks if t.get("status") == "blocked"])
    overdue = len([t for t in tasks if t.get("due_date") and 
                   datetime.fromisoformat(str(t["due_date"]).replace("Z", "")) < datetime.utcnow() and 
                   t.get("status") != "completed"])
    
    # Base score from completion rate
    completion_score = (completed / total_tasks) * 60
    
    # Penalty for blocked tasks
    blocked_penalty = (blocked / total_tasks) * 20
    
    # Penalty for overdue tasks
    overdue_penalty = (overdue / total_tasks) * 20
    
    # Calculate final score
    health_score = max(0, min(100, 40 + completion_score - blocked_penalty - overdue_penalty))
    
    return int(health_score)


async def get_ai_recommendations(context: Dict[str, Any]) -> List[str]:
    """Get AI-powered recommendations"""
    recommendations = []
    
    tasks = context.get("tasks", [])
    projects = context.get("projects", [])
    
    # Task-based recommendations
    blocked_count = len([t for t in tasks if t.get("status") == "blocked"])
    if blocked_count > 2:
        recommendations.append(
            "Multiple blocked tasks detected. Consider scheduling a blocker review meeting."
        )
    
    high_priority_count = len([t for t in tasks if t.get("priority") == "high" and t.get("status") != "completed"])
    if high_priority_count > 5:
        recommendations.append(
            "Many high priority tasks pending. Consider re-prioritizing or delegating some tasks."
        )
    
    # Project-based recommendations
    low_health_projects = [p for p in projects if p.get("health_score", 50) < 40]
    if low_health_projects:
        recommendations.append(
            f"{len(low_health_projects)} project{'s need' if len(low_health_projects) > 1 else ' needs'} attention. Review and address blockers."
        )
    
    if not recommendations:
        recommendations.append("Projects are on track. Continue monitoring progress.")
    
    return recommendations


async def analyze_task_risk(task: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze if a task is at risk"""
    risk = False
    reason = None
    
    due_date = task.get("due_date")
    status = task.get("status")
    priority = task.get("priority")
    
    if due_date and status != "completed":
        due = datetime.fromisoformat(str(due_date).replace("Z", ""))
        days_until_due = (due - datetime.utcnow()).days
        
        if days_until_due < 0:
            risk = True
            reason = "Task is overdue"
        elif days_until_due <= 2 and status == "not_started":
            risk = True
            reason = "Task due soon but not started"
        elif days_until_due <= 1 and status == "in_progress":
            risk = True
            reason = "Task due very soon"
    
    if status == "blocked":
        risk = True
        reason = reason or "Task is blocked"
    
    if priority == "high" and status == "not_started":
        risk = True
        reason = reason or "High priority task not started"
    
    return {"ai_risk": risk, "ai_risk_reason": reason}



async def analyze_goals_vs_achievements(goals: List[Dict], achievements: List[Dict]) -> Dict[str, Any]:
    """
    AI-powered analysis comparing weekly goals against achievements.
    Returns insights on what was achieved, what's missing, and recommendations.
    """
    total_goals = len(goals)
    total_achievements = len(achievements)
    
    if total_goals == 0:
        return {
            "score": 0,
            "status": "no_goals",
            "summary": "No goals set for this period.",
            "achieved": [],
            "missing": [],
            "recommendations": ["Set clear, measurable goals for better tracking."]
        }
    
    # Calculate achievement rate
    achievement_rate = min(100, (total_achievements / total_goals) * 100)
    
    # Determine status
    if achievement_rate >= 90:
        status = "excellent"
        status_message = "Outstanding performance! Goals exceeded."
    elif achievement_rate >= 70:
        status = "good"
        status_message = "Good progress. Most goals achieved."
    elif achievement_rate >= 50:
        status = "moderate"
        status_message = "Moderate progress. Room for improvement."
    elif achievement_rate > 0:
        status = "needs_improvement"
        status_message = "Below target. Review blockers and priorities."
    else:
        status = "critical"
        status_message = "No achievements recorded. Immediate attention needed."
    
    # Generate recommendations based on analysis
    recommendations = []
    
    if achievement_rate < 50:
        recommendations.append("Consider breaking down goals into smaller, achievable tasks.")
        recommendations.append("Review if goals were realistic and properly scoped.")
    
    if achievement_rate >= 50 and achievement_rate < 80:
        recommendations.append("Focus on high-impact goals first.")
        recommendations.append("Identify and remove blockers early in the week.")
    
    if achievement_rate >= 80:
        recommendations.append("Excellent work! Consider setting stretch goals.")
        recommendations.append("Share successful strategies with the team.")
    
    # Try to use OpenAI for deeper analysis if available
    client = get_openai_client()
    if client and total_goals > 0:
        try:
            goals_text = "\n".join([f"- {g.get('goal', g.get('text', str(g)))}" for g in goals])
            achievements_text = "\n".join([f"- {a.get('achievement', a.get('text', str(a)))}" for a in achievements]) if achievements else "None recorded"
            
            response = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[{
                    "role": "system",
                    "content": "You are a project management AI assistant. Analyze goals vs achievements and provide brief, actionable insights."
                }, {
                    "role": "user",
                    "content": f"Goals set:\n{goals_text}\n\nAchievements:\n{achievements_text}\n\nProvide 2-3 specific, actionable recommendations in bullet points."
                }],
                max_tokens=200
            )
            ai_recommendations = response.choices[0].message.content.strip()
            recommendations.append(ai_recommendations)
        except Exception as e:
            pass  # Fall back to rule-based recommendations
    
    return {
        "score": int(achievement_rate),
        "status": status,
        "summary": status_message,
        "goals_count": total_goals,
        "achievements_count": total_achievements,
        "recommendations": recommendations
    }


async def generate_team_insights(users: List[Dict], tasks: List[Dict]) -> List[Dict]:
    """Generate insights about team workload and performance"""
    insights = []
    
    # Calculate workload per user
    user_workload = {}
    for task in tasks:
        for assignee_id in task.get("assignee_ids", []):
            if assignee_id not in user_workload:
                user_workload[assignee_id] = {"total": 0, "completed": 0, "overdue": 0, "high_priority": 0}
            user_workload[assignee_id]["total"] += 1
            if task.get("status") == "completed":
                user_workload[assignee_id]["completed"] += 1
            if task.get("priority") == "high":
                user_workload[assignee_id]["high_priority"] += 1
            if task.get("due_date"):
                try:
                    due = datetime.fromisoformat(str(task["due_date"]).replace("Z", ""))
                    if due < datetime.utcnow() and task.get("status") != "completed":
                        user_workload[assignee_id]["overdue"] += 1
                except:
                    pass
    
    # Find overloaded team members
    avg_tasks = sum(w["total"] for w in user_workload.values()) / len(user_workload) if user_workload else 0
    
    for user_id, workload in user_workload.items():
        if workload["total"] > avg_tasks * 1.5:
            user = next((u for u in users if str(u.get("_id")) == user_id), None)
            if user:
                insights.append({
                    "type": "warning",
                    "title": "Workload Alert",
                    "message": f"{user.get('name', 'A team member')} has {workload['total']} tasks assigned, which is above average."
                })
        
        if workload["overdue"] > 2:
            user = next((u for u in users if str(u.get("_id")) == user_id), None)
            if user:
                insights.append({
                    "type": "negative",
                    "title": "Overdue Tasks",
                    "message": f"{user.get('name', 'A team member')} has {workload['overdue']} overdue tasks."
                })
    
    if not insights:
        insights.append({
            "type": "positive",
            "title": "Team Balance",
            "message": "Team workload is well distributed."
        })
    
    return insights
