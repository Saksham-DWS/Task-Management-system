"""
Seed script for DWS Project Manager
Creates demo users with proper password hashes
Does NOT delete existing data - only adds missing users or updates passwords
"""
import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

from app.config import settings, _db_name_from_uri

MONGODB_URL = settings.mongodb_url
DATABASE_NAME = _db_name_from_uri(MONGODB_URL)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


async def seed_database():
    print(f"Connecting to MongoDB for seeding: {DATABASE_NAME}")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    users_collection = db["users"]

    # Demo users to create/update
    demo_users = [
        {
            "name": "Admin User",
            "email": "admin@dws.com",
            "password": hash_password("admin123"),
            "role": "admin",
            "access": {"category_ids": [], "project_ids": [], "task_ids": []},
        },
        {
            "name": "John Manager",
            "email": "john@dws.com",
            "password": hash_password("password123"),
            "role": "manager",
            "access": {"category_ids": [], "project_ids": [], "task_ids": []},
        },
        {
            "name": "Sarah Developer",
            "email": "sarah@dws.com",
            "password": hash_password("password123"),
            "role": "user",
            "access": {"category_ids": [], "project_ids": [], "task_ids": []},
        },
        {
            "name": "Mike Designer",
            "email": "mike@dws.com",
            "password": hash_password("password123"),
            "role": "user",
            "access": {"category_ids": [], "project_ids": [], "task_ids": []},
        },
    ]

    print("\nProcessing users...")

    for user in demo_users:
        existing = await users_collection.find_one(
            {"email": {"$regex": f"^{user['email']}$", "$options": "i"}}
        )
        if not existing:
            user["created_at"] = datetime.utcnow()
            user["updated_at"] = datetime.utcnow()
            await users_collection.insert_one(user)
            print(f"  Created user: {user['email']}")
        else:
            await users_collection.update_one(
                {"_id": existing["_id"]},
                {"$set": {"password": user["password"], "updated_at": datetime.utcnow()}},
            )
            print(f"  Updated password for: {user['email']}")

    total_users = await users_collection.count_documents({})
    total_categories = await db["categories"].count_documents({})
    total_projects = await db["projects"].count_documents({})
    total_tasks = await db["tasks"].count_documents({})

    print(f"\n--- Database Summary ---")
    print(f"  Users: {total_users}")
    print(f"  Categories: {total_categories}")
    print(f"  Projects: {total_projects}")
    print(f"  Tasks: {total_tasks}")

    client.close()

    print("\nSeed completed successfully!")
    print("\nDemo credentials:")
    print("  Admin: admin@dws.com / admin123")
    print("  Manager: john@dws.com / password123")
    print("  User: sarah@dws.com / password123")
    print("  User: mike@dws.com / password123")


if __name__ == "__main__":
    asyncio.run(seed_database())
