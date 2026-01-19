import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Query
from bson import ObjectId

from ..database import get_goals_collection, get_users_collection
from ..models import GoalCreate, GoalStatusUpdate, GoalCommentCreate, GoalStatus
from ..services.auth import get_current_user
from ..services.notifications import dispatch_notification

router = APIRouter(prefix="/api/goals", tags=["Goals"])


def _normalize_id(value) -> str:
    return str(value) if value is not None else ""


def _is_admin(current_user: dict) -> bool:
    return current_user.get("role") in ["admin", "super_admin"]


def _is_manager(current_user: dict) -> bool:
    return current_user.get("role") in ["manager", "admin", "super_admin"]


def _build_goal_filter(goal_id: str) -> dict:
    filters = []
    try:
        filters.append({"_id": ObjectId(goal_id)})
    except Exception:
        pass
    filters.append({"_id": goal_id})
    return filters[0] if len(filters) == 1 else {"$or": filters}


def _normalize_status(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized in ["all", "any"]:
        return None
    return normalized


def _normalize_target_month(value: str | None) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        trimmed = value.strip()
        if re.match(r"^\d{4}-\d{2}$", trimmed):
            return trimmed
        if re.match(r"^\d{4}-\d{2}-\d{2}$", trimmed):
            return trimmed[:7]
    return ""


def _parse_target_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        trimmed = value.strip()
        try:
            if re.match(r"^\d{4}-\d{2}-\d{2}$", trimmed):
                return datetime.strptime(trimmed, "%Y-%m-%d")
            if re.match(r"^\d{2}-\d{2}-\d{4}$", trimmed):
                return datetime.strptime(trimmed, "%d-%m-%Y")
            return datetime.fromisoformat(trimmed.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def activity_timestamp() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def dt_to_iso_z(value):
    if not value:
        return None
    if isinstance(value, str):
        if value.endswith("Z") or value.endswith("z"):
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


def format_email_datetime(value):
    if not value:
        return None
    parsed = None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    if not parsed:
        return None
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc)
    else:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.strftime("%a, %b %d, %Y %I:%M %p UTC")


def build_activity_entry(description: str, current_user: dict) -> dict:
    return {
        "description": description,
        "timestamp": activity_timestamp(),
        "user_id": current_user.get("_id"),
        "user": current_user.get("name", "Unknown")
    }


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


async def _fetch_user_map(user_ids: set) -> dict:
    if not user_ids:
        return {}
    users = get_users_collection()
    object_ids = []
    for uid in user_ids:
        try:
            object_ids.append(ObjectId(uid))
        except Exception:
            continue
    if not object_ids:
        return {}
    cursor = users.find({"_id": {"$in": object_ids}}, {"password": 0})
    user_map = {}
    async for user in cursor:
        user["_id"] = str(user["_id"])
        user_map[user["_id"]] = user
    return user_map


async def populate_goals_bulk(goals: list) -> list:
    if not goals:
        return []
    user_ids = set()
    for goal in goals:
        goal["_id"] = str(goal["_id"])
        if goal.get("assigned_to"):
            user_ids.add(str(goal.get("assigned_to")))
        if goal.get("assigned_by"):
            user_ids.add(str(goal.get("assigned_by")))

    user_map = await _fetch_user_map(user_ids)

    for goal in goals:
        assigned_to = _normalize_id(goal.get("assigned_to"))
        assigned_by = _normalize_id(goal.get("assigned_by"))
        if assigned_to and assigned_to in user_map:
            goal["assigned_to_user"] = user_map[assigned_to]
        if assigned_by and assigned_by in user_map:
            goal["assigned_by_user"] = user_map[assigned_by]

        for field in ["assigned_at", "achieved_at", "rejected_at", "created_at", "updated_at", "target_date"]:
            goal[field] = dt_to_iso_z(goal.get(field))

        activity_entries = normalize_activity_entries(goal.get("activity", []))
        def _activity_sort_key(item: dict):
            ts = item.get("timestamp")
            if not ts:
                return datetime.min
            try:
                return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            except Exception:
                return datetime.min
        goal["activity"] = sorted(activity_entries, key=_activity_sort_key, reverse=True)

    return goals


async def _fetch_user_by_id(user_id: str) -> dict | None:
    users = get_users_collection()
    try:
        user = await users.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    except Exception:
        user = await users.find_one({"_id": user_id}, {"password": 0})
    if not user:
        return None
    user["_id"] = str(user["_id"])
    return user


def _can_assign_goal(current_user: dict, assigned_to: str) -> bool:
    return True


def _can_view_goal(current_user: dict, goal: dict) -> bool:
    if _is_admin(current_user):
        return True
    current_id = str(current_user.get("_id"))
    return current_id in [str(goal.get("assigned_to")), str(goal.get("assigned_by"))]


def _can_update_status(current_user: dict, goal: dict) -> bool:
    if _is_admin(current_user):
        return True
    return str(current_user.get("_id")) == str(goal.get("assigned_to"))


def _can_manage_goal(current_user: dict, goal: dict) -> bool:
    if _is_admin(current_user):
        return True
    return str(current_user.get("_id")) == str(goal.get("assigned_by"))


@router.get("/my")
async def list_my_goals(
    status: str | None = Query(default=None),
    month: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user)
):
    goals = get_goals_collection()
    filters = {"assigned_to": str(current_user.get("_id"))}
    normalized_status = _normalize_status(status)
    if normalized_status:
        filters["status"] = normalized_status
    normalized_month = _normalize_target_month(month)
    if normalized_month:
        filters["target_month"] = normalized_month
    cursor = goals.find(filters).sort("assigned_at", -1)
    results = []
    async for goal in cursor:
        results.append(goal)
    return await populate_goals_bulk(results)


@router.get("/assigned")
async def list_assigned_goals(
    status: str | None = Query(default=None),
    month: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user)
):
    goals = get_goals_collection()
    filters = {"assigned_by": str(current_user.get("_id"))}
    normalized_status = _normalize_status(status)
    if normalized_status:
        filters["status"] = normalized_status
    normalized_month = _normalize_target_month(month)
    if normalized_month:
        filters["target_month"] = normalized_month
    cursor = goals.find(filters).sort("assigned_at", -1)
    results = []
    async for goal in cursor:
        results.append(goal)
    return await populate_goals_bulk(results)


@router.get("/{goal_id}")
async def get_goal(
    goal_id: str,
    current_user: dict = Depends(get_current_user)
):
    goals = get_goals_collection()
    goal = await goals.find_one(_build_goal_filter(goal_id))
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if not _can_view_goal(current_user, goal):
        raise HTTPException(status_code=403, detail="Not authorized to view this goal")
    return (await populate_goals_bulk([goal]))[0]


@router.post("")
async def create_goal(
    data: GoalCreate,
    current_user: dict = Depends(get_current_user)
):
    goals = get_goals_collection()
    assigned_to = str(data.assigned_to)
    if not _can_assign_goal(current_user, assigned_to):
        raise HTTPException(status_code=403, detail="Not authorized to assign goals")

    raw_target_date = data.target_date
    target_date = _parse_target_date(raw_target_date)
    if raw_target_date and not target_date:
        raise HTTPException(status_code=400, detail="Target date must be a valid ISO date")
    target_month = _normalize_target_month(data.target_month)
    if target_date:
        target_month = target_date.strftime("%Y-%m")
    if not target_month:
        raise HTTPException(status_code=400, detail="Target date is required")

    title = (data.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Goal title is required")

    assignee = await _fetch_user_by_id(assigned_to)
    if not assignee:
        raise HTTPException(status_code=404, detail="Assignee not found")

    now = datetime.utcnow()
    goal_doc = {
        "title": title,
        "description": (data.description or "").strip() or None,
        "assigned_to": assigned_to,
        "assigned_by": str(current_user.get("_id")),
        "target_date": target_date,
        "target_month": target_month,
        "priority": data.priority.value if hasattr(data.priority, "value") else str(data.priority),
        "status": GoalStatus.PENDING.value,
        "assigned_at": now,
        "achieved_at": None,
        "rejected_at": None,
        "user_comment": None,
        "manager_comment": None,
        "rejection_reason": None,
        "activity": [
            build_activity_entry(
                f"Goal assigned to {assignee.get('name', 'User')} by {current_user.get('name', 'Unknown')}",
                current_user
            )
        ],
        "created_at": now,
        "updated_at": now
    }

    result = await goals.insert_one(goal_doc)
    goal_doc["_id"] = str(result.inserted_id)

    timestamp_label = format_email_datetime(now) or dt_to_iso_z(now) or ""
    goal_title = goal_doc.get("title", "Goal")
    assignee_name = assignee.get("name", "User")
    assigner_name = current_user.get("name", "Unknown")

    assigner_id = str(current_user.get("_id"))
    if assigned_to == assigner_id:
        await dispatch_notification(
            [assigned_to],
            "goal_assigned",
            f'You assigned yourself a goal "{goal_title}" on {timestamp_label}.',
            current_user,
            send_email=True,
            send_in_app=True,
            email_subject=f"Goal Assigned: {goal_title}",
            email_body=f'You assigned yourself a goal "{goal_title}" on {timestamp_label}.',
            include_actor=True
        )
    else:
        await dispatch_notification(
            [assigned_to],
            "goal_assigned",
            f'{assigner_name} assigned you a goal "{goal_title}" on {timestamp_label}.',
            current_user,
            send_email=True,
            send_in_app=True,
            email_subject=f"Goal Assigned: {goal_title}",
            email_body=f'{assigner_name} assigned you a goal "{goal_title}" on {timestamp_label}.',
            include_actor=False
        )

        await dispatch_notification(
            [assigner_id],
            "goal_assigned",
            f'You assigned a goal "{goal_title}" to {assignee_name} on {timestamp_label}.',
            current_user,
            send_email=True,
            send_in_app=True,
            email_subject=f"Goal Assigned: {goal_title}",
            email_body=f'You assigned a goal "{goal_title}" to {assignee_name} on {timestamp_label}.',
            include_actor=True
        )

    return (await populate_goals_bulk([goal_doc]))[0]


@router.put("/{goal_id}/status")
async def update_goal_status(
    goal_id: str,
    data: GoalStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    goals = get_goals_collection()
    goal = await goals.find_one(_build_goal_filter(goal_id))
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if not _can_update_status(current_user, goal):
        raise HTTPException(status_code=403, detail="Not authorized to update this goal")

    new_status = data.status.value if hasattr(data.status, "value") else str(data.status)
    if new_status not in [GoalStatus.PENDING.value, GoalStatus.ACHIEVED.value, GoalStatus.REJECTED.value]:
        raise HTTPException(status_code=400, detail="Invalid goal status")

    comment = (data.comment or "").strip()
    now = datetime.utcnow()
    updates = {"status": new_status, "updated_at": now}
    activity_message = None

    if new_status == GoalStatus.ACHIEVED.value:
        updates["achieved_at"] = now
        updates["rejected_at"] = None
        if comment:
            updates["user_comment"] = comment
        activity_message = f'Goal marked achieved by {current_user.get("name", "Unknown")}'
    elif new_status == GoalStatus.REJECTED.value:
        if not comment:
            raise HTTPException(status_code=400, detail="Rejection reason is required")
        updates["rejected_at"] = now
        updates["achieved_at"] = None
        updates["rejection_reason"] = comment
        activity_message = f'Goal rejected by {current_user.get("name", "Unknown")}'
    else:
        updates["achieved_at"] = None
        updates["rejected_at"] = None
        activity_message = f'Goal marked pending by {current_user.get("name", "Unknown")}'

    if activity_message:
        await goals.update_one(
            _build_goal_filter(goal_id),
            {
                "$set": updates,
                "$push": {"activity": build_activity_entry(activity_message, current_user)}
            }
        )
    else:
        await goals.update_one(_build_goal_filter(goal_id), {"$set": updates})

    updated = await goals.find_one(_build_goal_filter(goal_id))

    if new_status == GoalStatus.ACHIEVED.value:
        assignee_name = current_user.get("name", "Unknown")
        assigner = await _fetch_user_by_id(str(goal.get("assigned_by"))) if goal.get("assigned_by") else None
        assigner_name = assigner.get("name") if assigner else "Assigner"
        timestamp_label = format_email_datetime(now) or dt_to_iso_z(now) or ""
        goal_title = goal.get("title", "Goal")

        assigned_to_id = str(goal.get("assigned_to"))
        assigned_by_id = str(goal.get("assigned_by"))
        if assigned_to_id == assigned_by_id:
            await dispatch_notification(
                [assigned_to_id],
                "goal_achieved",
                f'You marked the goal "{goal_title}" as achieved on {timestamp_label}.',
                current_user,
                send_email=True,
                send_in_app=True,
                email_subject=f"Goal Achieved: {goal_title}",
                email_body=f'You marked the goal "{goal_title}" as achieved on {timestamp_label}.',
                include_actor=True
            )
        else:
            await dispatch_notification(
                [assigned_to_id],
                "goal_achieved",
                f'You marked the goal "{goal_title}" as achieved on {timestamp_label}.',
                current_user,
                send_email=True,
                send_in_app=True,
                email_subject=f"Goal Achieved: {goal_title}",
                email_body=f'You marked the goal "{goal_title}" as achieved on {timestamp_label}.',
                include_actor=True
            )

            await dispatch_notification(
                [assigned_by_id],
                "goal_achieved",
                f'Goal "{goal_title}" was marked achieved by {assignee_name} on {timestamp_label}.',
                current_user,
                send_email=True,
                send_in_app=True,
                email_subject=f"Goal Achieved: {goal_title}",
                email_body=f'Goal "{goal_title}" was marked achieved by {assignee_name} on {timestamp_label}.',
                include_actor=True
            )

        if comment:
            if assigned_to_id == assigned_by_id:
                await dispatch_notification(
                    [assigned_to_id],
                    "goal_comments",
                    f'You added a comment on the goal "{goal_title}": "{comment}".',
                    current_user,
                    send_email=True,
                    send_in_app=True,
                    email_subject=f"Goal Comment: {goal_title}",
                    email_body=f'You added a comment on the goal "{goal_title}": "{comment}".',
                    include_actor=True
                )
            else:
                await dispatch_notification(
                    [assigned_by_id],
                    "goal_comments",
                    f'{assignee_name} added a comment on the goal "{goal_title}": "{comment}".',
                    current_user,
                    send_email=True,
                    send_in_app=True,
                    email_subject=f"Goal Comment: {goal_title}",
                    email_body=f'{assignee_name} added a comment on the goal "{goal_title}": "{comment}".',
                    include_actor=True
                )
                await dispatch_notification(
                    [assigned_to_id],
                    "goal_comments",
                    f'You added a comment on the goal "{goal_title}" assigned by {assigner_name}: "{comment}".',
                    current_user,
                    send_email=True,
                    send_in_app=True,
                    email_subject=f"Goal Comment: {goal_title}",
                    email_body=f'You added a comment on the goal "{goal_title}" assigned by {assigner_name}: "{comment}".',
                    include_actor=True
                )

    return (await populate_goals_bulk([updated]))[0]


@router.post("/{goal_id}/comments")
async def add_goal_comment(
    goal_id: str,
    data: GoalCommentCreate,
    current_user: dict = Depends(get_current_user)
):
    goals = get_goals_collection()
    goal = await goals.find_one(_build_goal_filter(goal_id))
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    if not _can_view_goal(current_user, goal):
        raise HTTPException(status_code=403, detail="Not authorized to comment on this goal")

    comment = (data.comment or "").strip()
    if not comment:
        raise HTTPException(status_code=400, detail="Comment is required")

    current_id = str(current_user.get("_id"))
    comment_type = (data.comment_type or "").strip().lower()
    if comment_type not in ["user", "manager"]:
        if current_id == str(goal.get("assigned_to")):
            comment_type = "user"
        elif current_id == str(goal.get("assigned_by")):
            comment_type = "manager"
        else:
            raise HTTPException(status_code=403, detail="Not authorized to add this comment")

    is_user_comment = comment_type == "user"
    if is_user_comment and current_id != str(goal.get("assigned_to")):
        raise HTTPException(status_code=403, detail="Only the assignee can add this comment")
    if not is_user_comment and current_id != str(goal.get("assigned_by")):
        raise HTTPException(status_code=403, detail="Only the assigner can add this comment")

    now = datetime.utcnow()
    updates = {
        "updated_at": now,
        "user_comment": comment if is_user_comment else goal.get("user_comment"),
        "manager_comment": comment if not is_user_comment else goal.get("manager_comment")
    }
    activity_message = (
        f'User comment added by {current_user.get("name", "Unknown")}'
        if is_user_comment else
        f'Manager comment added by {current_user.get("name", "Unknown")}'
    )

    await goals.update_one(
        _build_goal_filter(goal_id),
        {
            "$set": updates,
            "$push": {"activity": build_activity_entry(activity_message, current_user)}
        }
    )

    updated = await goals.find_one(_build_goal_filter(goal_id))

    goal_title = goal.get("title", "Goal")
    timestamp_label = format_email_datetime(now) or dt_to_iso_z(now) or ""
    assignee = await _fetch_user_by_id(str(goal.get("assigned_to"))) if goal.get("assigned_to") else None
    assigner = await _fetch_user_by_id(str(goal.get("assigned_by"))) if goal.get("assigned_by") else None
    assignee_name = assignee.get("name") if assignee else "Assignee"
    assigner_name = assigner.get("name") if assigner else "Assigner"

    assigned_to_id = str(goal.get("assigned_to"))
    assigned_by_id = str(goal.get("assigned_by"))
    if assigned_to_id == assigned_by_id:
        await dispatch_notification(
            [assigned_to_id],
            "goal_comments",
            f'You added a comment on the goal "{goal_title}": "{comment}" on {timestamp_label}.',
            current_user,
            send_email=True,
            send_in_app=True,
            email_subject=f"Goal Comment: {goal_title}",
            email_body=f'You added a comment on the goal "{goal_title}": "{comment}" on {timestamp_label}.',
            include_actor=True
        )
    elif is_user_comment:
        await dispatch_notification(
            [assigned_to_id],
            "goal_comments",
            f'You added a comment on the goal "{goal_title}" assigned by {assigner_name}: "{comment}" on {timestamp_label}.',
            current_user,
            send_email=True,
            send_in_app=True,
            email_subject=f"Goal Comment: {goal_title}",
            email_body=f'You added a comment on the goal "{goal_title}" assigned by {assigner_name}: "{comment}" on {timestamp_label}.',
            include_actor=True
        )
        await dispatch_notification(
            [assigned_by_id],
            "goal_comments",
            f'{assignee_name} added a comment on the goal "{goal_title}": "{comment}" on {timestamp_label}.',
            current_user,
            send_email=True,
            send_in_app=True,
            email_subject=f"Goal Comment: {goal_title}",
            email_body=f'{assignee_name} added a comment on the goal "{goal_title}": "{comment}" on {timestamp_label}.',
            include_actor=True
        )
    else:
        await dispatch_notification(
            [assigned_by_id],
            "goal_comments",
            f'You added a comment on the goal "{goal_title}" for {assignee_name}: "{comment}" on {timestamp_label}.',
            current_user,
            send_email=True,
            send_in_app=True,
            email_subject=f"Goal Comment: {goal_title}",
            email_body=f'You added a comment on the goal "{goal_title}" for {assignee_name}: "{comment}" on {timestamp_label}.',
            include_actor=True
        )
        await dispatch_notification(
            [assigned_to_id],
            "goal_comments",
            f'{assigner_name} added a comment on the goal "{goal_title}": "{comment}" on {timestamp_label}.',
            current_user,
            send_email=True,
            send_in_app=True,
            email_subject=f"Goal Comment: {goal_title}",
            email_body=f'{assigner_name} added a comment on the goal "{goal_title}": "{comment}" on {timestamp_label}.',
            include_actor=True
        )

    return (await populate_goals_bulk([updated]))[0]


@router.delete("/{goal_id}")
async def delete_goal(
    goal_id: str,
    current_user: dict = Depends(get_current_user)
):
    goals = get_goals_collection()
    goal = await goals.find_one(_build_goal_filter(goal_id))
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if not _can_manage_goal(current_user, goal):
        raise HTTPException(status_code=403, detail="Not authorized to delete this goal")

    result = await goals.delete_one(_build_goal_filter(goal_id))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"message": "Goal deleted"}
