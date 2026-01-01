from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from bson import ObjectId

from ..database import get_notifications_collection, get_users_collection
from ..models import NotificationPreferences
from ..services.auth import get_current_user, require_role
from ..services.notifications import merge_preferences

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def _notification_filter(notification_id: str, user_id: str):
    id_filters = []
    try:
        id_filters.append({"_id": ObjectId(notification_id)})
    except Exception:
        pass
    id_filters.append({"_id": notification_id})
    return {"$and": [{"user_id": user_id}, {"$or": id_filters}]}

def _user_filter(user_id: str):
    id_filters = []
    try:
        id_filters.append({"_id": ObjectId(user_id)})
    except Exception:
        pass
    id_filters.append({"_id": user_id})
    return {"$or": id_filters}


@router.get("")
async def list_notifications(current_user: dict = Depends(get_current_user)):
    notifications = get_notifications_collection()
    cursor = notifications.find({"user_id": current_user["_id"]}).sort("created_at", -1)
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)
    return results


@router.put("/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    notifications = get_notifications_collection()
    await notifications.update_many(
        {"user_id": current_user["_id"], "read": {"$ne": True}},
        {"$set": {"read": True}}
    )
    return {"message": "All notifications marked as read"}


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    notifications = get_notifications_collection()
    result = await notifications.update_one(
        _notification_filter(notification_id, current_user["_id"]),
        {"$set": {"read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}


@router.put("/{notification_id}/unread")
async def mark_notification_unread(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    notifications = get_notifications_collection()
    result = await notifications.update_one(
        _notification_filter(notification_id, current_user["_id"]),
        {"$set": {"read": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as unread"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    notifications = get_notifications_collection()
    result = await notifications.delete_one(
        _notification_filter(notification_id, current_user["_id"])
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification deleted"}


@router.get("/preferences")
async def get_notification_preferences(current_user: dict = Depends(get_current_user)):
    return merge_preferences(current_user.get("notification_preferences"))


@router.put("/preferences")
async def update_notification_preferences(
    preferences: NotificationPreferences,
    current_user: dict = Depends(get_current_user)
):
    users = get_users_collection()
    payload = preferences.model_dump()
    await users.update_one(
        _user_filter(current_user["_id"]),
        {"$set": {"notification_preferences": payload, "updated_at": datetime.utcnow()}}
    )
    return payload


@router.put("/preferences/{user_id}")
async def update_notification_preferences_for_user(
    user_id: str,
    preferences: NotificationPreferences,
    _current_user: dict = Depends(require_role(["admin", "manager"]))
):
    users = get_users_collection()
    payload = preferences.model_dump()
    result = await users.update_one(
        _user_filter(user_id),
        {"$set": {"notification_preferences": payload, "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return payload
