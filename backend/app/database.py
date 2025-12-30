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


async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("Closed MongoDB connection")


def get_database():
    return db


# Collection getters
def get_users_collection():
    return db["users"]


def get_categories_collection():
    return db["categories"]


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
