import asyncio

from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings, _db_name_from_uri

client = None
db = None


async def connect_to_mongo():
    global client, db
    uri = settings.mongodb_url
    db_name = _db_name_from_uri(uri)
    print(f"Connecting using URI: {uri}")
    client = AsyncIOMotorClient(uri)
    db = client[db_name]
    print(f"Connected to MongoDB: {db_name}")
    await ensure_indexes()


async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("Closed MongoDB connection")


def get_database():
    return db


async def ensure_indexes():
    if db is None:
        return
    projects = db["projects"]
    tasks = db["tasks"]
    comments = db["comments"]
    notifications = db["notifications"]

    index_tasks = [
        projects.create_index("group_id"),
        projects.create_index("owner_id"),
        projects.create_index("collaborator_ids"),
        projects.create_index("access_user_ids"),
        projects.create_index([("group_id", 1), ("status", 1)]),
        tasks.create_index("project_id"),
        tasks.create_index("group_id"),
        tasks.create_index("assignee_ids"),
        tasks.create_index("collaborator_ids"),
        tasks.create_index("assigned_by_id"),
        tasks.create_index([("project_id", 1), ("status", 1)]),
        tasks.create_index("due_date"),
        comments.create_index("task_id"),
        comments.create_index("project_id"),
        notifications.create_index([("user_id", 1), ("created_at", -1)]),
    ]

    results = await asyncio.gather(*index_tasks, return_exceptions=True)
    for result in results:
        if isinstance(result, Exception):
            print(f"Index ensure warning: {result}")


# Collection getters
def get_users_collection():
    return db["users"]


def get_groups_collection():
    return db["groups"]


def get_projects_collection():
    return db["projects"]


def get_tasks_collection():
    return db["tasks"]


def get_comments_collection():
    return db["comments"]


def get_notifications_collection():
    return db["notifications"]


def get_ai_insights_collection():
    return db["ai_insights"]
