from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId

from ..database import get_notifications_collection
from ..services.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def _notification_filter(notification_id: str, user_id: str):
    id_filters = []
    try:
        id_filters.append({"_id": ObjectId(notification_id)})
    except Exception:
        pass
    id_filters.append({"_id": notification_id})
    return {"$and": [{"user_id": user_id}, {"$or": id_filters}]}


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
