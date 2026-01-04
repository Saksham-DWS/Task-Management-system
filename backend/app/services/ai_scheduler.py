from datetime import datetime, timedelta
import random
import asyncio
from bson import ObjectId

from ..config import settings
from ..database import (
    get_ai_insights_collection,
    get_projects_collection,
    get_tasks_collection,
    get_groups_collection,
    get_users_collection,
    get_comments_collection
)
from .ai import generate_project_ai_insights, generate_admin_ai_insights, _word_count, _to_iso_z
from .notifications import build_weekly_digest, dispatch_notification, merge_preferences

_BOOTSTRAPPED = False


def _next_due_at(base_time: datetime, interval_hours: int) -> datetime:
    jitter_minutes = max(0, int(settings.ai_insights_jitter_minutes))
    jitter = timedelta(minutes=random.randint(0, jitter_minutes)) if jitter_minutes else timedelta()
    return base_time + timedelta(hours=interval_hours) + jitter


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.replace(tzinfo=None)
        except Exception:
            return None
    return None


async def ensure_project_schedules():
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED:
        return
    projects = get_projects_collection()
    insights = get_ai_insights_collection()
    now = datetime.utcnow()
    async for project in projects.find({}, {"_id": 1, "created_at": 1}):
        project_id = str(project.get("_id"))
        existing = await insights.find_one({"scope": "project", "project_id": project_id}, {"_id": 1})
        if existing:
            continue
        created_at = project.get("created_at") or now
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            except Exception:
                created_at = now
        await insights.insert_one({
            "scope": "project",
            "project_id": project_id,
            "generated_at": None,
            "generated_by": None,
            "next_due_at": _next_due_at(created_at, settings.ai_project_interval_hours),
            "created_at": now,
            "updated_at": now
        })
    _BOOTSTRAPPED = True


async def schedule_project_insight(project_id: str, created_at: datetime | None = None):
    insights = get_ai_insights_collection()
    now = datetime.utcnow()
    base_time = created_at
    if isinstance(created_at, str):
        try:
            base_time = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except Exception:
            base_time = None
    await insights.update_one(
        {"scope": "project", "project_id": project_id},
        {
            "$setOnInsert": {
                "scope": "project",
                "project_id": project_id,
                "created_at": now
            },
            "$set": {
                "next_due_at": _next_due_at(base_time or now, settings.ai_project_interval_hours),
                "updated_at": now
            }
        },
        upsert=True
    )


async def schedule_admin_insight():
    insights = get_ai_insights_collection()
    now = datetime.utcnow()
    await insights.update_one(
        {"scope": "admin"},
        {
            "$setOnInsert": {
                "scope": "admin",
                "created_at": now
            },
            "$set": {
                "next_due_at": _next_due_at(now, settings.ai_admin_interval_hours),
                "updated_at": now
            }
        },
        upsert=True
    )


async def generate_project_insight(
    project_id: str,
    triggered_by: str = "system",
    force_refresh: bool = False
) -> dict | None:
    projects = get_projects_collection()
    tasks = get_tasks_collection()
    comments = get_comments_collection()
    insights = get_ai_insights_collection()
    existing = await insights.find_one({"scope": "project", "project_id": project_id})
    try:
        project = await projects.find_one({"_id": ObjectId(project_id)})
    except Exception:
        return None
    if not project:
        await insights.delete_one({"scope": "project", "project_id": project_id})
        return None

    task_list = []
    async for task in tasks.find({"project_id": project_id}):
        task_list.append(task)

    def _trim_text(value: str | None, limit: int = 140) -> str:
        if not value:
            return ""
        text = " ".join(str(value).split())
        return text if len(text) <= limit else text[: limit - 3] + "..."

    task_ids = [str(task.get("_id")) for task in task_list if task.get("_id")]
    project_comments = []
    task_comments = []
    if comments is not None:
        project_cursor = comments.find({"project_id": project_id}).sort("created_at", -1).limit(5)
        async for comment in project_cursor:
            project_comments.append({
                "content": _trim_text(comment.get("content")),
                "created_at": _to_iso_z(comment.get("created_at")),
                "user_id": str(comment.get("user_id")) if comment.get("user_id") else None
            })
        if task_ids:
            task_cursor = comments.find({"task_id": {"$in": task_ids}}).sort("created_at", -1).limit(5)
            async for comment in task_cursor:
                task_comments.append({
                    "content": _trim_text(comment.get("content")),
                    "created_at": _to_iso_z(comment.get("created_at")),
                    "task_id": comment.get("task_id"),
                    "user_id": str(comment.get("user_id")) if comment.get("user_id") else None
                })

    result = await generate_project_ai_insights(
        project,
        task_list,
        project_comments=project_comments,
        task_comments=task_comments
    )
    now = datetime.utcnow()
    next_due = _next_due_at(now, settings.ai_project_interval_hours)
    if (
        result.get("source") == "fallback"
        and existing
        and existing.get("source") in ["ai", "ai_cached"]
        and not force_refresh
    ):
        payload = {
            "scope": "project",
            "project_id": project_id,
            "summary": existing.get("summary"),
            "recommendation": existing.get("recommendation"),
            "goals_summary": existing.get("goals_summary"),
            "citations": existing.get("citations", []),
            "task_insights": existing.get("task_insights", []),
            "generated_at": existing.get("generated_at"),
            "generated_by": existing.get("generated_by"),
            "last_attempt_at": now,
            "next_due_at": next_due,
            "source": "ai_cached",
            "ai_error": result.get("ai_error"),
            "word_count": existing.get("word_count"),
            "updated_at": now
        }
        await insights.update_one(
            {"scope": "project", "project_id": project_id},
            {"$set": payload, "$setOnInsert": {"created_at": existing.get("created_at") or now}},
            upsert=True
        )
        return payload
    payload = {
        "scope": "project",
        "project_id": project_id,
        "generated_at": now,
        "generated_by": triggered_by,
        "next_due_at": next_due,
        "summary": result.get("summary"),
        "recommendation": result.get("recommendation"),
        "goals_summary": result.get("goals_summary"),
        "citations": result.get("citations", []),
        "task_insights": result.get("task_insights", []),
        "source": result.get("source", "ai"),
        "ai_error": result.get("ai_error"),
        "word_count": _word_count(result.get("summary", "")),
        "updated_at": now
    }
    await insights.update_one(
        {"scope": "project", "project_id": project_id},
        {"$set": payload, "$setOnInsert": {"created_at": now}},
        upsert=True
    )
    return payload


async def generate_admin_insight(triggered_by: str = "system", force_refresh: bool = False) -> dict:
    groups = get_groups_collection()
    projects = get_projects_collection()
    tasks = get_tasks_collection()
    users = get_users_collection()
    insights = get_ai_insights_collection()

    group_list = []
    async for group in groups.find({}):
        group_list.append(group)

    project_list = []
    async for project in projects.find({}):
        project_list.append(project)

    task_list = []
    async for task in tasks.find({}):
        task_list.append(task)

    user_list = []
    async for user in users.find({}, {"password": 0}):
        user_list.append(user)

    result = await generate_admin_ai_insights(group_list, project_list, task_list, user_list)
    now = datetime.utcnow()
    next_due = _next_due_at(now, settings.ai_admin_interval_hours)
    existing = await insights.find_one({"scope": "admin"})
    if (
        result.get("source") == "fallback"
        and existing
        and existing.get("source") in ["ai", "ai_cached"]
        and not force_refresh
    ):
        payload = {
            "scope": "admin",
            "analysis": existing.get("analysis"),
            "recommendations": existing.get("recommendations"),
            "focus_area": existing.get("focus_area"),
            "team_balance": existing.get("team_balance"),
            "quick_win": existing.get("quick_win"),
            "group_summaries": existing.get("group_summaries", []),
            "project_summaries": existing.get("project_summaries", []),
            "generated_at": existing.get("generated_at"),
            "generated_by": existing.get("generated_by"),
            "last_attempt_at": now,
            "next_due_at": next_due,
            "source": "ai_cached",
            "ai_error": result.get("ai_error"),
            "word_count": existing.get("word_count"),
            "updated_at": now
        }
        await insights.update_one(
            {"scope": "admin"},
            {"$set": payload, "$setOnInsert": {"created_at": existing.get("created_at") or now}},
            upsert=True
        )
        return payload
    payload = {
        "scope": "admin",
        "generated_at": now,
        "generated_by": triggered_by,
        "next_due_at": next_due,
        "analysis": result.get("analysis"),
        "recommendations": result.get("recommendations"),
        "focus_area": result.get("focus_area"),
        "team_balance": result.get("team_balance"),
        "quick_win": result.get("quick_win"),
        "group_summaries": result.get("group_summaries", []),
        "project_summaries": result.get("project_summaries", []),
        "source": result.get("source", "ai"),
        "ai_error": result.get("ai_error"),
        "word_count": _word_count(result.get("recommendations", "")),
        "updated_at": now
    }
    await insights.update_one(
        {"scope": "admin"},
        {"$set": payload, "$setOnInsert": {"created_at": now}},
        upsert=True
    )
    return payload


def serialize_insight(doc: dict | None) -> dict | None:
    if not doc:
        return None
    doc = dict(doc)
    for key in ["generated_at", "next_due_at", "updated_at", "created_at", "last_attempt_at"]:
        if doc.get(key):
            doc[key] = _to_iso_z(doc.get(key))
    if doc.get("_id"):
        doc["_id"] = str(doc["_id"])
    if doc.get("source") == "ai_cached":
        doc["source"] = "ai"
    return doc


async def run_ai_scheduler():
    if not settings.ai_scheduler_enabled:
        return
    await schedule_admin_insight()
    while True:
        try:
            await ensure_project_schedules()
            await schedule_admin_insight()
            await _process_due_projects()
            await _process_due_admin()
            await _process_due_weekly_digests()
        except Exception:
            pass
        await asyncio.sleep(settings.ai_scheduler_poll_seconds)


async def _process_due_projects():
    insights = get_ai_insights_collection()
    now = datetime.utcnow()
    cursor = insights.find(
        {"scope": "project", "next_due_at": {"$lte": now}}
    ).sort("next_due_at", 1).limit(settings.ai_project_batch_size)

    async for doc in cursor:
        project_id = doc.get("project_id")
        if project_id:
            await generate_project_insight(project_id, triggered_by="system")


async def _process_due_admin():
    insights = get_ai_insights_collection()
    now = datetime.utcnow()
    doc = await insights.find_one({"scope": "admin"})
    if not doc:
        await schedule_admin_insight()
        return
    next_due = doc.get("next_due_at")
    if next_due and next_due <= now:
        await generate_admin_insight(triggered_by="system")


async def _process_due_weekly_digests():
    if not settings.weekly_digest_enabled:
        return
    users = get_users_collection()
    now = datetime.utcnow()
    interval = timedelta(hours=max(1, int(settings.weekly_digest_interval_hours)))
    async for user in users.find({"status": {"$ne": "inactive"}}):
        prefs = merge_preferences(user.get("notification_preferences"))
        if not prefs.get("weekly_digest"):
            continue
        last_sent = _parse_dt((user.get("notification_meta") or {}).get("weekly_digest_last_sent"))
        if last_sent and last_sent + interval > now:
            continue
        digest = await build_weekly_digest(user, now - interval, now)
        if not digest:
            continue
        subject = digest.get("subject") or "Weekly Digest"
        email_body = digest.get("email_body") or digest.get("summary") or ""
        message = digest.get("in_app_message") or "Your weekly digest is ready."
        await dispatch_notification(
            [str(user.get("_id"))],
            "weekly_digest",
            message,
            {"_id": "system", "name": "System"},
            send_email=True,
            email_subject=subject,
            email_body=email_body
        )
        await users.update_one(
            {"_id": user.get("_id")},
            {"$set": {"notification_meta.weekly_digest_last_sent": now}}
        )
