from typing import List, Dict, Any
from datetime import datetime, timedelta, timezone
import asyncio
import json

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


def _to_iso_z(value):
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.replace(microsecond=0).isoformat() + "Z"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(microsecond=0).isoformat() + "Z"
    except Exception:
        return str(value)


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except Exception:
        return None


def _word_count(text: str) -> int:
    if not text:
        return 0
    return len([t for t in text.split() if t])


def _truncate_words(text: str, max_words: int) -> str:
    if not text:
        return ""
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words])


def _ensure_min_words(text: str, min_words: int, extra_sections: List[str]) -> str:
    if _word_count(text) >= min_words:
        return text
    sections = []
    if text:
        sections.append(text)
    if not extra_sections:
        return "\n\n".join(sections)
    index = 0
    max_iters = 50
    while _word_count(" ".join(sections)) < min_words and index < max_iters:
        section = extra_sections[index % len(extra_sections)]
        if section:
            sections.append(section)
        index += 1
    return "\n\n".join([s for s in sections if s])


def _admin_expansion_sections(categories, projects, tasks, users):
    total_tasks = len(tasks)
    completed = len([t for t in tasks if t.get("status") == "completed"])
    on_hold = len([t for t in tasks if t.get("status") in ["hold", "blocked"]])
    overdue = len([
        t for t in tasks
        if _parse_datetime(t.get("due_date")) and _parse_datetime(t.get("due_date")) < datetime.utcnow() and t.get("status") != "completed"
    ])
    completion_rate = int((completed / total_tasks) * 100) if total_tasks else 0
    category_names = ", ".join([c.get("name", "Category") for c in categories[:6]]) or "your categories"
    project_names = ", ".join([p.get("name", "Project") for p in projects[:6]]) or "your projects"

    analysis_sections = [
        (
            f"Portfolio activity spans {len(projects)} projects across {len(categories)} categories. "
            f"Overall completion sits at {completion_rate}%, with {overdue} overdue items and {on_hold} on hold. "
            "This indicates momentum but also a need to clear aging work so teams can sustain delivery."
        ),
        (
            f"Category performance shows uneven health across {category_names}. "
            "Teams in lower health categories should receive focused check-ins, clearer scope boundaries, "
            "and short cycle goals to regain stability without reducing long term targets."
        ),
        (
            f"Project trends across {project_names} show mixed execution signals. "
            "Projects with growing task queues or stalled review stages should be escalated, "
            "with owners reporting daily progress until blockers are resolved."
        ),
        (
            f"Team workload spans {len(users)} active users. "
            "Watch for concentration of high priority tasks on a small subset of people, "
            "and rebalance ownership so each person can move tasks from start to finish without excessive handoffs."
        ),
        (
            "Goals and achievements activity should remain visible in weekly rituals. "
            "Teams that log goals but miss follow-up achievements need stronger checkpointing, "
            "clear success criteria, and smaller weekly goals that can be validated with measurable outputs."
        )
    ]

    recommendation_sections = [
        (
            "Focus on a two day cycle for overdue work: identify blockers, assign a single owner, "
            "agree on a next step, and update due dates. Use a daily standup to keep pressure on the oldest tasks "
            "until the overdue queue drops to a sustainable baseline."
        ),
        (
            "Balance team capacity by tracking tasks per person and reassigning long running items. "
            "If one person owns multiple high priority tasks, split the work into smaller units and spread them "
            "across contributors with aligned skills to reduce stall risk."
        ),
        (
            "Create quick wins by targeting tasks already in review or nearing completion. "
            "Closing these tasks increases momentum, updates project health scores, and provides visible progress "
            "that can energize the team and reinforce delivery habits."
        ),
        (
            "Improve scope discipline by reviewing projects with expanding backlogs. "
            "Freeze new requests until the current sprint is stable, and use impact scoring to decide what moves forward. "
            "This prevents teams from being pulled in too many directions."
        ),
        (
            "Strengthen goal achievement by turning weekly goals into smaller checkpoints with explicit acceptance criteria. "
            "When achievements are logged, capture short notes on what worked, which blockers appeared, and how the team will "
            "avoid the same risks next cycle."
        ),
        (
            "Increase visibility with consistent reporting. "
            "Each project owner should publish a short weekly update covering progress, risks, and priority shifts. "
            "These updates should map directly to the AI insights so leaders can act without extra analysis."
        ),
        (
            "Align priorities across categories by ranking projects based on business impact and deadline proximity. "
            "Projects with low health but high impact deserve immediate support, while low impact work can be paused "
            "to recover capacity."
        ),
        (
            "Invest in collaboration routines. "
            "Encourage cross functional reviews between engineering, operations, and marketing so blockers are resolved quickly "
            "and shared context reduces rework."
        ),
        (
            "Standardize definition of done. "
            "Teams should agree on completion criteria, testing expectations, and documentation requirements so tasks move "
            "cleanly through review without repeated cycles."
        ),
        (
            "Track and celebrate wins. "
            "Highlight projects that improved health or completed major goals, and reuse the tactics that enabled those results "
            "across other categories."
        )
    ]

    return analysis_sections, recommendation_sections


def _task_health(task: Dict[str, Any], now: datetime) -> Dict[str, str]:
    status = task.get("status") or "unknown"
    due = _parse_datetime(task.get("due_date"))
    overdue = bool(due and due < now and status != "completed")

    if status == "completed":
        return {"health": "on_track", "reason": "completed"}
    if status in ["hold", "blocked"]:
        return {"health": "at_risk", "reason": "on_hold"}
    if overdue:
        return {"health": "at_risk", "reason": "overdue"}
    if due and (due - now).days <= 2 and status in ["not_started", "in_progress"]:
        return {"health": "needs_attention", "reason": "due_soon"}
    return {"health": "on_track", "reason": "stable"}


def _project_goal_stats(project: Dict[str, Any]) -> Dict[str, Any]:
    goals = project.get("weekly_goals") or []
    total = len(goals)
    matched = 0
    recent_goals = []
    for goal in goals:
        achievements = goal.get("achievements") or []
        if achievements:
            matched += 1
        recent_goals.append({
            "text": goal.get("text", ""),
            "created_at": _to_iso_z(goal.get("created_at")),
            "achievement_count": len(achievements)
        })
    match_rate = int((matched / total) * 100) if total else 0
    return {
        "total": total,
        "matched": matched,
        "match_rate": match_rate,
        "recent_goals": recent_goals[:5]
    }


def _task_goal_stats(task: Dict[str, Any]) -> Dict[str, Any]:
    goals = task.get("weekly_goals") or []
    achievements = task.get("weekly_achievements") or []
    achieved = 0
    for goal in goals:
        if goal.get("status") == "achieved" or goal.get("achieved_at"):
            achieved += 1
    return {
        "goals_total": len(goals),
        "goals_achieved": achieved,
        "achievements_count": len(achievements)
    }


def _safe_json_loads(content: str) -> Dict[str, Any] | None:
    if not content:
        return None
    try:
        return json.loads(content)
    except Exception:
        pass
    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(content[start:end + 1])
    except Exception:
        return None


async def _openai_chat(
    messages: List[Dict[str, str]],
    max_tokens: int,
    json_mode: bool = False,
    retries: int = 2,
    return_error: bool = False
) -> str | tuple[str | None, str | None] | None:
    client = get_openai_client()
    if not client:
        return (None, "OpenAI client not available") if return_error else None

    def _call(use_json: bool):
        payload = {
            "model": settings.openai_model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": max_tokens
        }
        if use_json:
            payload["response_format"] = {"type": "json_object"}
        response = client.chat.completions.create(**payload)
        return response.choices[0].message.content.strip()

    last_error = None
    for attempt in range(max(1, retries)):
        try:
            content = await asyncio.to_thread(_call, json_mode)
            return (content, None) if return_error else content
        except TypeError:
            json_mode = False
            try:
                content = await asyncio.to_thread(_call, False)
                return (content, None) if return_error else content
            except Exception as exc:
                last_error = exc
        except Exception as exc:
            last_error = exc
            if json_mode and "response_format" in str(exc).lower():
                json_mode = False
        if attempt < retries - 1:
            await asyncio.sleep(0.4 * (attempt + 1))

    if return_error:
        return None, str(last_error) if last_error else "Unknown OpenAI error"
    return None


def _weekly_digest_fallback(context: Dict[str, Any]) -> Dict[str, Any]:
    user = context.get("user", {})
    stats = context.get("stats", {})
    window = context.get("window", {})
    tasks = context.get("tasks", [])

    def _format_window(value: str | None) -> str:
        if not value:
            return ""
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.strftime("%d %b %Y")
        except Exception:
            return value

    start_label = _format_window(window.get("start"))
    end_label = _format_window(window.get("end"))
    subject = f"Weekly Digest: {start_label} - {end_label}".strip(" -")

    total = stats.get("tasks_total", 0)
    completed = stats.get("tasks_completed", 0)
    created = stats.get("tasks_created", 0)
    updated = stats.get("tasks_updated", 0)
    overdue = stats.get("tasks_overdue", 0)
    task_comments = stats.get("task_comments", 0)
    project_comments = stats.get("project_comments", 0)

    if total == 0:
        summary = "No task activity was recorded for the last week. Create or update tasks to see progress insights."
    else:
        summary = (
            f"You have {total} active tasks. Last week you completed {completed}, created {created}, "
            f"and updated {updated} task(s). {overdue} task(s) are overdue. "
            f"You received {task_comments} task comment(s) and {project_comments} project comment(s)."
        )

    highlights = []
    for task in tasks[:3]:
        title = task.get("title") or "Task"
        status = task.get("status") or "unknown"
        priority = task.get("priority") or "normal"
        highlights.append(f"{title} ({status}, {priority})")
    if not highlights:
        highlights.append("Keep tasks updated to surface weekly highlights.")

    next_steps = []
    if overdue > 0:
        next_steps.append("Review overdue tasks and reset priorities or due dates.")
    if completed == 0 and total > 0:
        next_steps.append("Close at least one active task to build momentum.")
    if task_comments > 0 or project_comments > 0:
        next_steps.append("Respond to recent comments to keep collaboration moving.")
    if not next_steps:
        next_steps.append("Keep progress steady by updating key tasks and goals.")

    return {
        "subject": subject,
        "summary": summary,
        "highlights": highlights,
        "next_steps": next_steps
    }


async def generate_weekly_digest(context: Dict[str, Any]) -> Dict[str, Any]:
    fallback = _weekly_digest_fallback(context)
    system_prompt = (
        "You are an assistant writing weekly digest summaries for a project management app. "
        "Return JSON only with keys: subject, summary, highlights, next_steps. "
        "Highlights and next_steps should be arrays of short strings."
    )
    user_prompt = (
        "Write a concise weekly digest for the user using the context below. "
        "Summary should be 60-120 words, highlights 3-5 bullets, next_steps 2-4 bullets. "
        "Use a professional, clear tone. "
        f"\n\nContext:\n{json.dumps(context, ensure_ascii=True)}"
    )

    content, error = await _openai_chat(
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        max_tokens=400,
        json_mode=True,
        retries=2,
        return_error=True
    )
    parsed = _safe_json_loads(content or "")
    if not parsed:
        return fallback

    subject = (parsed.get("subject") or "").strip() or fallback["subject"]
    summary = (parsed.get("summary") or "").strip() or fallback["summary"]
    highlights = parsed.get("highlights") or fallback["highlights"]
    next_steps = parsed.get("next_steps") or fallback["next_steps"]

    return {
        "subject": subject,
        "summary": summary,
        "highlights": highlights,
        "next_steps": next_steps
    }


def _project_fallback_insights(
    project: Dict[str, Any],
    tasks: List[Dict[str, Any]],
    project_comments: List[Dict[str, Any]] | None = None,
    task_comments: List[Dict[str, Any]] | None = None
) -> Dict[str, Any]:
    now = datetime.utcnow()
    project_name = project.get("name", "Untitled")
    project_label = f"**{project_name}**"
    project_comments = project_comments or []
    task_comments = task_comments or []
    total_tasks = len(tasks)
    completed = len([t for t in tasks if t.get("status") == "completed"])
    on_hold = len([t for t in tasks if t.get("status") in ["hold", "blocked"]])
    overdue = len([
        t for t in tasks
        if _parse_datetime(t.get("due_date")) and _parse_datetime(t.get("due_date")) < now and t.get("status") != "completed"
    ])
    goal_stats = _project_goal_stats(project)
    summary_parts = [
        f"{project_label} has {total_tasks} tasks, with {completed} completed.",
        f"{on_hold} task(s) are on hold and {overdue} task(s) are overdue.",
        f"Goal alignment is {goal_stats['match_rate']}% based on goals with achievements."
    ]
    if project_comments or task_comments:
        summary_parts.append(
            f"{len(project_comments)} project comment(s) and {len(task_comments)} task comment(s) were logged recently."
        )
    summary = " ".join(summary_parts)
    recommendations = []
    if overdue > 0:
        recommendations.append(f"Address overdue tasks in {project_label} by resetting priorities and removing blockers.")
    if on_hold > 0:
        recommendations.append(f"Review tasks on hold in {project_label} to clarify ownership and next steps.")
    if goal_stats["match_rate"] < 50 and goal_stats["total"] > 0:
        recommendations.append("Revisit goal scope and add weekly checkpoints to improve achievement rates.")
    if not recommendations:
        recommendations.append(f"Maintain current momentum for {project_label} and keep weekly goals visible to the team.")
    task_insights = []
    for task in tasks:
        health = _task_health(task, now)
        task_title = task.get("title", "Task")
        task_label = f"**{task_title}**"
        task_insights.append({
            "task_id": str(task.get("_id")),
            "task_title": task_title,
            "status": task.get("status"),
            "health": health["health"],
            "insight": f"{task_label} is {health['reason'].replace('_', ' ')}.",
            "recommendation": f"Confirm next action and due date for {task_label}."
        })
    citations = [
        {"label": "Total tasks", "value": total_tasks},
        {"label": "Completed tasks", "value": completed},
        {"label": "Overdue tasks", "value": overdue},
        {"label": "Goals achieved rate", "value": f"{goal_stats['match_rate']}%"}
    ]
    return {
        "summary": summary,
        "recommendation": " ".join(recommendations),
        "goals_summary": f"{goal_stats['matched']} of {goal_stats['total']} goals have achievements.",
        "citations": citations,
        "task_insights": task_insights,
        "source": "fallback"
    }


def _project_expansion_sections(
    project: Dict[str, Any],
    tasks: List[Dict[str, Any]],
    project_comments: List[Dict[str, Any]] | None = None,
    task_comments: List[Dict[str, Any]] | None = None
):
    now = datetime.utcnow()
    project_name = project.get("name", "Untitled")
    project_label = f"**{project_name}**"
    project_comments = project_comments or []
    task_comments = task_comments or []
    total_tasks = len(tasks)
    completed = len([t for t in tasks if t.get("status") == "completed"])
    on_hold = len([t for t in tasks if t.get("status") in ["hold", "blocked"]])
    overdue = len([
        t for t in tasks
        if _parse_datetime(t.get("due_date")) and _parse_datetime(t.get("due_date")) < now and t.get("status") != "completed"
    ])
    goal_stats = _project_goal_stats(project)
    task_titles = [t.get("title") for t in tasks if t.get("title")]
    task_labels = [f"**{title}**" for title in task_titles[:4]]
    task_list_text = ", ".join(task_labels)
    task_line = f"Key tasks include {task_list_text}. " if task_list_text else ""

    summary_sections = [
        (
            f"{project_label} spans {total_tasks} tasks with {completed} completed so far, "
            f"while {on_hold} are on hold and {overdue} are overdue. "
            "Momentum is visible, but attention is needed on tasks that are not moving."
        ),
        (
            f"Goals and achievements alignment for {project_label} is {goal_stats['match_rate']}% with "
            f"{goal_stats['matched']} goals showing achievement replies. "
            "Use weekly check-ins to convert pending goals into measurable outcomes."
        ),
        (
            f"Task health varies by stage in {project_label}. "
            f"{task_line}"
            "Prioritize items nearing due dates and remove blockers quickly. "
            "Stable throughput will lift overall project health and reduce risk near delivery."
        )
    ]
    if project_comments or task_comments:
        summary_sections.append(
            f"Recent feedback includes {len(project_comments)} project comment(s) and {len(task_comments)} task comment(s). "
            "Use these signals to identify blockers, scope changes, or support needs."
        )

    recommendation_sections = [
        (
            "Focus on the highest risk tasks first. Assign a clear owner, confirm next steps, "
            "and update the due date to reflect reality. This keeps the delivery plan credible."
        ),
        (
            f"Use short weekly goals in {project_label} tied to acceptance criteria so achievements are easy to log. "
            "When goals are missed, document the blocker and adjust scope early."
        ),
        (
            "Close out near-complete tasks to build momentum, then shift attention to the next critical path items. "
            "Avoid introducing new scope until overdue work is stabilized."
        )
    ]

    goals_sections = [
        (
            f"{goal_stats['matched']} of {goal_stats['total']} goals in {project_label} have achievement replies. "
            "Goals without replies should be revisited with the owner after the 7 day window."
        ),
        (
            "Strong goal tracking comes from clear success criteria, short timeboxes, and quick feedback loops. "
            "Use achievements to surface what was completed and what remains."
        )
    ]

    return summary_sections, recommendation_sections, goals_sections


async def generate_project_ai_insights(
    project: Dict[str, Any],
    tasks: List[Dict[str, Any]],
    project_comments: List[Dict[str, Any]] | None = None,
    task_comments: List[Dict[str, Any]] | None = None
) -> Dict[str, Any]:
    now = datetime.utcnow()
    goal_stats = _project_goal_stats(project)
    project_comments = project_comments or []
    task_comments = task_comments or []

    tasks_sorted = sorted(
        tasks,
        key=lambda t: (
            0 if t.get("status") == "completed" else 1,
            0 if _task_health(t, now)["health"] == "at_risk" else 1
        )
    )

    task_limit = settings.ai_project_task_limit
    task_sample = tasks_sorted[:task_limit]
    task_payload = []
    for task in task_sample:
        task_goal_stats = _task_goal_stats(task)
        health = _task_health(task, now)
        task_payload.append({
            "task_id": str(task.get("_id")),
            "title": task.get("title", ""),
            "status": task.get("status"),
            "priority": task.get("priority"),
            "due_date": _to_iso_z(task.get("due_date")),
            "health": health["health"],
            "health_reason": health["reason"],
            "goals_total": task_goal_stats["goals_total"],
            "goals_achieved": task_goal_stats["goals_achieved"],
            "achievements_count": task_goal_stats["achievements_count"]
        })

    context = {
        "project": {
            "id": str(project.get("_id")),
            "name": project.get("name", ""),
            "status": project.get("status"),
            "start_date": _to_iso_z(project.get("start_date") or project.get("startDate")),
            "end_date": _to_iso_z(project.get("end_date") or project.get("endDate")),
            "task_total": len(tasks),
            "task_sampled": len(task_payload),
            "goals_total": goal_stats["total"],
            "goals_matched": goal_stats["matched"],
            "goals_match_rate": goal_stats["match_rate"]
        },
        "goals": goal_stats["recent_goals"],
        "tasks": task_payload,
        "comments": {
            "project_comment_count": len(project_comments),
            "task_comment_count": len(task_comments),
            "recent_project_comments": project_comments[:5],
            "recent_task_comments": task_comments[:5]
        }
    }

    system_prompt = (
        "You are a project management AI. Use the provided data to write insights and recommendations "
        "for a project. Respond in JSON only with no extra text."
    )

    def build_user_prompt(include_task_insights: bool) -> str:
        if include_task_insights:
            schema = (
                "summary (200-300 words), recommendation (80-120 words), goals_summary (40-60 words), "
                "citations (array of {label, value}), task_insights (array of {task_id, task_title, health, insight, recommendation}). "
                "Each task insight should be 20-35 words."
            )
        else:
            schema = (
                "summary (200-300 words), recommendation (80-120 words), goals_summary (40-60 words), "
                "citations (array of {label, value}). Do not include task_insights."
            )
        return (
            "Analyze the project and tasks. Output JSON with keys: "
            f"{schema} "
            "Use only the provided data and keep wording practical. "
            "If comments are provided, reference themes or blockers briefly. "
            "Bold the project name and task titles using **double asterisks** inside the summary and recommendation. "
            "Do not include markdown outside of bold markers."
            f"\n\nContext:\n{json.dumps(context, ensure_ascii=True)}"
        )

    async def attempt_ai(include_task_insights: bool, max_tokens: int) -> tuple[Dict[str, Any] | None, str | None]:
        user_prompt = build_user_prompt(include_task_insights)
        content, error = await _openai_chat(
            [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            max_tokens=max_tokens,
            json_mode=True,
            retries=2,
            return_error=True
        )
        parsed = _safe_json_loads(content or "")
        if parsed:
            return parsed, None
        repair_prompt = (
            "Return ONLY a valid JSON object with the schema described earlier. "
            "If the previous response was not valid JSON, fix it. "
            "Do not add commentary."
        )
        content, repair_error = await _openai_chat(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": content or ""},
                {"role": "user", "content": repair_prompt}
            ],
            max_tokens=max_tokens,
            json_mode=True,
            retries=1,
            return_error=True
        )
        return _safe_json_loads(content or ""), repair_error or error

    parsed, ai_error = await attempt_ai(True, max_tokens=1600)
    used_ai = parsed is not None
    if not parsed:
        parsed, ai_error = await attempt_ai(False, max_tokens=1000)
        used_ai = parsed is not None
    if not parsed:
        fallback = _project_fallback_insights(project, tasks, project_comments, task_comments)
        fallback["generated_at"] = _to_iso_z(now)
        fallback["ai_error"] = ai_error
        return fallback

    summary = (parsed.get("summary") or "").strip()
    recommendation = (parsed.get("recommendation") or "").strip()
    goals_summary = (parsed.get("goals_summary") or "").strip()
    citations = parsed.get("citations") or []
    task_insights = parsed.get("task_insights") or []

    fallback = _project_fallback_insights(project, tasks, project_comments, task_comments)
    if not summary:
        summary = fallback["summary"]
    if not recommendation:
        recommendation = fallback["recommendation"]
    if not goals_summary:
        goals_summary = fallback["goals_summary"]
    if not citations:
        citations = fallback["citations"]

    fallback_task_insights = fallback["task_insights"]
    if not task_insights:
        task_insights = fallback_task_insights
    elif len(task_insights) < len(tasks):
        ai_by_id = {ti.get("task_id"): ti for ti in task_insights if ti.get("task_id")}
        merged = []
        for fallback_task in fallback_task_insights:
            task_id = fallback_task.get("task_id")
            merged.append(ai_by_id.get(task_id, fallback_task))
        task_insights = merged

    summary_sections, recommendation_sections, goals_sections = _project_expansion_sections(
        project,
        tasks,
        project_comments,
        task_comments
    )
    summary = _ensure_min_words(summary, 200, summary_sections)
    summary = _truncate_words(summary, 300)
    recommendation = _ensure_min_words(recommendation, 80, recommendation_sections)
    recommendation = _truncate_words(recommendation, 120)
    goals_summary = _ensure_min_words(goals_summary, 40, goals_sections)
    goals_summary = _truncate_words(goals_summary, 60)

    return {
        "summary": summary,
        "recommendation": recommendation,
        "goals_summary": goals_summary,
        "citations": citations,
        "task_insights": task_insights,
        "source": "ai" if used_ai else "fallback",
        "generated_at": _to_iso_z(now),
        "ai_error": ai_error if not used_ai else None
    }


def _admin_fallback_insights(categories: List[Dict[str, Any]], projects: List[Dict[str, Any]], tasks: List[Dict[str, Any]], users: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_tasks = len(tasks)
    completed = len([t for t in tasks if t.get("status") == "completed"])
    on_hold = len([t for t in tasks if t.get("status") in ["hold", "blocked"]])
    overdue = len([
        t for t in tasks
        if _parse_datetime(t.get("due_date")) and _parse_datetime(t.get("due_date")) < datetime.utcnow() and t.get("status") != "completed"
    ])

    analysis = (
        f"There are {len(projects)} projects across {len(categories)} categories. "
        f"Task completion stands at {completed} of {total_tasks}, with {overdue} overdue and {on_hold} on hold. "
        "Overall delivery is stable but needs attention on aging work and stalled items. "
        "Category performance varies, with teams showing uneven workloads."
    )

    recommendations = (
        "Focus on reducing overdue tasks by aligning owners, dates, and daily follow ups. "
        "Rebalance work by moving low priority tasks away from overloaded members. "
        "Create quick wins by closing near complete tasks and clarifying blockers for stalled work."
    )

    category_summaries = [
        {"category_id": str(c.get("_id")), "name": c.get("name", ""), "insight": f"{c.get('name','Category')} has {len([p for p in projects if str(p.get('category_id')) == str(c.get('_id'))])} projects and needs regular health check-ins."}
        for c in categories
    ]
    project_summaries = [
        {"project_id": str(p.get("_id")), "name": p.get("name", ""), "insight": f"{p.get('name','Project')} needs steady execution to keep tasks moving toward completion."}
        for p in projects
    ]

    return {
        "analysis": analysis,
        "recommendations": recommendations,
        "focus_area": "Resolve overdue and blocked tasks with clear ownership.",
        "team_balance": "Balance assignments across team members based on current workload.",
        "quick_win": "Close tasks that are in review or near completion this week.",
        "category_summaries": category_summaries,
        "project_summaries": project_summaries,
        "source": "fallback"
    }


async def generate_admin_ai_insights(categories: List[Dict[str, Any]], projects: List[Dict[str, Any]], tasks: List[Dict[str, Any]], users: List[Dict[str, Any]]) -> Dict[str, Any]:
    totals = {
        "categories": len(categories),
        "projects": len(projects),
        "tasks": len(tasks),
        "users": len(users)
    }

    category_payload = []
    for category in categories:
        category_projects = [p for p in projects if str(p.get("category_id")) == str(category.get("_id"))]
        avg_health = (
            sum([p.get("health_score", 50) for p in category_projects]) / len(category_projects)
            if category_projects else 0
        )
        category_payload.append({
            "category_id": str(category.get("_id")),
            "name": category.get("name", ""),
            "project_count": len(category_projects),
            "avg_health": int(avg_health)
        })

    project_payload = []
    tasks_by_project = {}
    for task in tasks:
        pid = str(task.get("project_id"))
        tasks_by_project.setdefault(pid, []).append(task)

    for project in projects:
        pid = str(project.get("_id"))
        project_tasks = tasks_by_project.get(pid, [])
        completed = len([t for t in project_tasks if t.get("status") == "completed"])
        overdue = len([
            t for t in project_tasks
            if _parse_datetime(t.get("due_date")) and _parse_datetime(t.get("due_date")) < datetime.utcnow() and t.get("status") != "completed"
        ])
        on_hold = len([t for t in project_tasks if t.get("status") in ["hold", "blocked"]])
        project_payload.append({
            "project_id": pid,
            "name": project.get("name", ""),
            "category_id": str(project.get("category_id")),
            "health_score": project.get("health_score", 50),
            "task_total": len(project_tasks),
            "task_completed": completed,
            "task_overdue": overdue,
            "task_on_hold": on_hold
        })

    user_payload = []
    tasks_by_user = {}
    for task in tasks:
        for uid in task.get("assignee_ids", []) or []:
            tasks_by_user.setdefault(str(uid), []).append(task)
    for user in users:
        uid = str(user.get("_id"))
        user_tasks = tasks_by_user.get(uid, [])
        completed = len([t for t in user_tasks if t.get("status") == "completed"])
        overdue = len([
            t for t in user_tasks
            if _parse_datetime(t.get("due_date")) and _parse_datetime(t.get("due_date")) < datetime.utcnow() and t.get("status") != "completed"
        ])
        user_payload.append({
            "user_id": uid,
            "name": user.get("name", ""),
            "task_total": len(user_tasks),
            "task_completed": completed,
            "task_overdue": overdue
        })

    context = {
        "totals": totals,
        "categories": category_payload,
        "projects": project_payload,
        "users": user_payload
    }

    system_prompt = (
        "You are an executive AI analyst for a project management platform. "
        "Write high quality analysis and recommendations with clear structure. "
        "Respond in JSON only with no extra text."
    )

    def build_user_prompt(include_summaries: bool) -> str:
        if include_summaries:
            schema = (
                "analysis (400-600 words), recommendations (1000-1500 words), "
                "focus_area (1 sentence), team_balance (1 sentence), quick_win (1 sentence), "
                "category_summaries (array of {category_id, name, insight} with ~30 words each), "
                "project_summaries (array of {project_id, name, insight} with ~20 words each)."
            )
        else:
            schema = (
                "analysis (400-600 words), recommendations (1000-1500 words), "
                "focus_area (1 sentence), team_balance (1 sentence), quick_win (1 sentence). "
                "Do not include category_summaries or project_summaries."
            )
        return (
            "Generate admin insights for categories, projects, tasks, and users. "
            f"Return JSON with keys: {schema} "
            "Bold category and project names using **double asterisks** inside analysis and recommendations. "
            "Use only the provided data."
            f"\n\nContext:\n{json.dumps(context, ensure_ascii=True)}"
        )

    async def attempt_ai(include_summaries: bool, max_tokens: int) -> tuple[Dict[str, Any] | None, str | None]:
        user_prompt = build_user_prompt(include_summaries)
        content, error = await _openai_chat(
            [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            max_tokens=max_tokens,
            json_mode=True,
            retries=2,
            return_error=True
        )
        parsed = _safe_json_loads(content or "")
        if parsed:
            return parsed, None
        repair_prompt = (
            "Return ONLY a valid JSON object with the schema described earlier. "
            "If the previous response was not valid JSON, fix it. "
            "Do not add commentary."
        )
        content, repair_error = await _openai_chat(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": content or ""},
                {"role": "user", "content": repair_prompt}
            ],
            max_tokens=max_tokens,
            json_mode=True,
            retries=1,
            return_error=True
        )
        return _safe_json_loads(content or ""), repair_error or error

    parsed, ai_error = await attempt_ai(True, max_tokens=2600)
    used_ai = parsed is not None
    if not parsed:
        parsed, ai_error = await attempt_ai(False, max_tokens=2000)
        used_ai = parsed is not None
    if not parsed:
        fallback = _admin_fallback_insights(categories, projects, tasks, users)
        fallback["generated_at"] = _to_iso_z(datetime.utcnow())
        fallback["ai_error"] = ai_error
        return fallback
    fallback = _admin_fallback_insights(categories, projects, tasks, users)
    analysis = (parsed.get("analysis") or "").strip() or fallback["analysis"]
    recommendations = (parsed.get("recommendations") or "").strip() or fallback["recommendations"]
    focus_area = (parsed.get("focus_area") or "").strip() or fallback["focus_area"]
    team_balance = (parsed.get("team_balance") or "").strip() or fallback["team_balance"]
    quick_win = (parsed.get("quick_win") or "").strip() or fallback["quick_win"]
    category_summaries = parsed.get("category_summaries") or fallback["category_summaries"]
    project_summaries = parsed.get("project_summaries") or fallback["project_summaries"]

    analysis_sections, recommendation_sections = _admin_expansion_sections(categories, projects, tasks, users)
    analysis = _ensure_min_words(analysis, 400, analysis_sections)
    analysis = _truncate_words(analysis, 600)
    recommendations = _ensure_min_words(recommendations, 1000, recommendation_sections)
    recommendations = _truncate_words(recommendations, 1500)

    return {
        "analysis": analysis,
        "recommendations": recommendations,
        "focus_area": focus_area,
        "team_balance": team_balance,
        "quick_win": quick_win,
        "category_summaries": category_summaries,
        "project_summaries": project_summaries,
        "source": "ai" if used_ai else "fallback",
        "generated_at": _to_iso_z(datetime.utcnow()),
        "ai_error": ai_error if not used_ai else None
    }
