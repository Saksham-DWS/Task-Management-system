from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import asyncio
import smtplib
import ssl
from typing import Iterable

from bson import ObjectId

from ..config import settings
from ..database import (
    get_notifications_collection,
    get_users_collection,
    get_tasks_collection,
    get_projects_collection,
    get_comments_collection
)
from .ai import generate_weekly_digest


DEFAULT_NOTIFICATION_PREFERENCES = {
    "in_app": True,
    "email": True,
    "task_assigned": True,
    "task_completed": True,
    "task_comments": True,
    "project_comments": True,
    "weekly_digest": False
}

EVENT_PREFERENCE_MAP = {
    "task_assigned": "task_assigned",
    "task_completed": "task_completed",
    "task_comments": "task_comments",
    "project_comments": "project_comments",
    "weekly_digest": "weekly_digest"
}


def merge_preferences(raw: dict | None) -> dict:
    merged = dict(DEFAULT_NOTIFICATION_PREFERENCES)
    if raw:
        for key, value in raw.items():
            if value is not None:
                merged[key] = bool(value)
    return merged


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo:
                parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
            return parsed
        except Exception:
            return None
    return None


def _preference_key(event_type: str | None) -> str | None:
    if not event_type:
        return None
    return EVENT_PREFERENCE_MAP.get(event_type)


def should_send(preferences: dict, channel: str, event_type: str | None) -> bool:
    if channel == "email" and not preferences.get("email", True):
        return False
    if channel == "in_app" and not preferences.get("in_app", True):
        return False
    pref_key = _preference_key(event_type)
    if pref_key and not preferences.get(pref_key, True):
        return False
    return True


def _smtp_configured() -> bool:
    if not settings.smtp_enabled:
        return False
    if not settings.smtp_host or not settings.smtp_from_email:
        return False
    return True


def _build_email_message(to_email: str, subject: str, body: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>".strip()
    msg["To"] = to_email
    msg.set_content(body)
    return msg


def _send_email_sync(to_email: str, subject: str, body: str) -> None:
    if not _smtp_configured():
        return
    msg = _build_email_message(to_email, subject, body)
    if settings.smtp_use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context) as server:
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(msg)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_use_tls:
            context = ssl.create_default_context()
            server.starttls(context=context)
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)


async def send_email_async(to_email: str, subject: str, body: str) -> None:
    if not _smtp_configured():
        return
    await asyncio.to_thread(_send_email_sync, to_email, subject, body)


async def _safe_send_email(to_email: str, subject: str, body: str) -> None:
    try:
        await send_email_async(to_email, subject, body)
    except Exception as exc:
        print(f"Email send failed for {to_email}: {exc}")


def _normalize_user_ids(user_ids: Iterable) -> list[str]:
    normalized = []
    for uid in user_ids or []:
        if uid is None:
            continue
        normalized.append(str(uid))
    return list(dict.fromkeys(normalized))


async def fetch_users_by_ids(user_ids: Iterable) -> list[dict]:
    normalized = _normalize_user_ids(user_ids)
    if not normalized:
        return []
    object_ids = []
    string_ids = []
    for uid in normalized:
        try:
            object_ids.append(ObjectId(uid))
        except Exception:
            string_ids.append(uid)
    filters = []
    if object_ids:
        filters.append({"_id": {"$in": object_ids}})
    if string_ids:
        filters.append({"_id": {"$in": string_ids}})
    if not filters:
        return []
    users = get_users_collection()
    cursor = users.find({"$or": filters}, {"password": 0})
    results = []
    async for user in cursor:
        user["_id"] = str(user["_id"])
        results.append(user)
    return results


def _format_weekly_digest_email(user: dict, digest: dict, stats: dict, window_start: datetime, window_end: datetime) -> str:
    start_label = window_start.strftime("%d %b %Y")
    end_label = window_end.strftime("%d %b %Y")
    name = user.get("name") or "there"
    highlights = digest.get("highlights") or []
    next_steps = digest.get("next_steps") or []

    lines = [
        f"Hi {name},",
        "",
        f"Here is your weekly digest for {start_label} - {end_label}.",
        "",
        digest.get("summary") or "",
        "",
        "Highlights:",
    ]
    if highlights:
        lines.extend([f"- {item}" for item in highlights])
    else:
        lines.append("- No highlights recorded.")
    lines.extend([
        "",
        "Next steps:",
    ])
    if next_steps:
        lines.extend([f"- {item}" for item in next_steps])
    else:
        lines.append("- Keep your tasks updated to unlock insights.")

    lines.extend([
        "",
        "Weekly stats:",
        f"- Total tasks: {stats.get('tasks_total', 0)}",
        f"- Created: {stats.get('tasks_created', 0)}",
        f"- Completed: {stats.get('tasks_completed', 0)}",
        f"- Updated: {stats.get('tasks_updated', 0)}",
        f"- Overdue: {stats.get('tasks_overdue', 0)}",
        f"- Task comments: {stats.get('task_comments', 0)}",
        f"- Project comments: {stats.get('project_comments', 0)}",
        "",
        "Thanks,",
        settings.smtp_from_name
    ])
    return "\n".join([line for line in lines if line is not None])


async def dispatch_notification(
    user_ids: Iterable,
    event_type: str,
    message: str,
    actor: dict | None,
    task_id: str | None = None,
    project_id: str | None = None,
    status: str | None = None,
    send_email: bool = True,
    send_in_app: bool = True,
    email_subject: str | None = None,
    email_body: str | None = None
) -> None:
    recipients = _normalize_user_ids(user_ids)
    if not recipients:
        return
    actor_id = str(actor.get("_id")) if actor else None
    if actor_id:
        recipients = [uid for uid in recipients if uid != actor_id]
    if not recipients:
        return

    users = await fetch_users_by_ids(recipients)
    if not users:
        return

    if send_in_app:
        notifications = get_notifications_collection()
        documents = []
        for user in users:
            prefs = merge_preferences(user.get("notification_preferences"))
            if not should_send(prefs, "in_app", event_type):
                continue
            documents.append({
                "user_id": user["_id"],
                "message": message,
                "task_id": task_id,
                "project_id": project_id,
                "type": event_type,
                "status": status,
                "actor": {"id": actor_id, "name": actor.get("name")} if actor else None,
                "read": False,
                "created_at": datetime.utcnow()
            })
        if documents:
            await notifications.insert_many(documents)

    if send_email and _smtp_configured():
        subject = email_subject or "Notification from DWS Project Manager"
        body = email_body or message
        for user in users:
            prefs = merge_preferences(user.get("notification_preferences"))
            if not should_send(prefs, "email", event_type):
                continue
            if not user.get("email"):
                continue
            asyncio.create_task(_safe_send_email(user["email"], subject, body))


async def build_weekly_digest(user: dict, window_start: datetime, window_end: datetime) -> dict | None:
    user_id = str(user.get("_id"))
    tasks = get_tasks_collection()
    comments = get_comments_collection()
    projects = get_projects_collection()

    task_cursor = tasks.find({
        "$or": [
            {"assignee_ids": user_id},
            {"collaborator_ids": user_id},
            {"assigned_by_id": user_id}
        ]
    })
    task_list = []
    async for task in task_cursor:
        task["_id"] = str(task["_id"])
        task_list.append(task)

    if not task_list:
        stats = {
            "tasks_total": 0,
            "tasks_created": 0,
            "tasks_completed": 0,
            "tasks_updated": 0,
            "tasks_overdue": 0,
            "task_comments": 0,
            "project_comments": 0
        }
        task_samples = []
    else:
        task_ids = [task.get("_id") for task in task_list if task.get("_id")]
        updated_count = 0
        created_count = 0
        completed_count = 0
        overdue_count = 0
        task_samples = []
        now = datetime.utcnow()
        for task in task_list:
            updated_at = _parse_datetime(task.get("updated_at")) or _parse_datetime(task.get("created_at"))
            created_at = _parse_datetime(task.get("created_at"))
            completed_at = _parse_datetime(task.get("completed_at"))
            due_date = _parse_datetime(task.get("due_date"))
            if updated_at and updated_at >= window_start:
                updated_count += 1
            if created_at and created_at >= window_start:
                created_count += 1
            if completed_at and completed_at >= window_start:
                completed_count += 1
            if due_date and due_date < now and task.get("status") != "completed":
                overdue_count += 1
            if len(task_samples) < 6:
                task_samples.append({
                    "id": task.get("_id"),
                    "title": task.get("title"),
                    "status": task.get("status"),
                    "priority": task.get("priority"),
                    "due_date": task.get("due_date")
                })

        task_comment_count = 0
        if task_ids:
            task_comment_count = await comments.count_documents({
                "task_id": {"$in": task_ids},
                "created_at": {"$gte": window_start}
            })

        project_comment_count = 0
        project_ids = []
        async for project in projects.find({"owner_id": user_id}, {"_id": 1}):
            project_ids.append(str(project.get("_id")))
        if project_ids:
            project_comment_count = await comments.count_documents({
                "project_id": {"$in": project_ids},
                "created_at": {"$gte": window_start}
            })

        stats = {
            "tasks_total": len(task_list),
            "tasks_created": created_count,
            "tasks_completed": completed_count,
            "tasks_updated": updated_count,
            "tasks_overdue": overdue_count,
            "task_comments": task_comment_count,
            "project_comments": project_comment_count
        }

    context = {
        "user": {"id": user_id, "name": user.get("name"), "email": user.get("email")},
        "window": {"start": window_start.isoformat() + "Z", "end": window_end.isoformat() + "Z"},
        "stats": stats,
        "tasks": task_samples
    }

    digest = await generate_weekly_digest(context)
    digest["email_body"] = _format_weekly_digest_email(user, digest, stats, window_start, window_end)
    digest["in_app_message"] = digest.get("summary") or "Your weekly digest is ready."
    return digest
