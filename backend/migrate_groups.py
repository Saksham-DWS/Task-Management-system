"""
Migration helper to rename Category data to Group data in MongoDB.
Run with: python migrate_groups.py [--dry-run]
"""
import sys
from pymongo import MongoClient

from app.config import settings, _db_name_from_uri


def rename_collection(db, old_name: str, new_name: str, dry_run: bool) -> None:
    collections = set(db.list_collection_names())
    if new_name in collections:
        print(f"Collection '{new_name}' already exists. Skipping rename from '{old_name}'.")
        return
    if old_name not in collections:
        print(f"Collection '{old_name}' not found. Skipping rename.")
        return
    if dry_run:
        print(f"[dry-run] Would rename collection '{old_name}' -> '{new_name}'.")
        return
    db[old_name].rename(new_name)
    print(f"Renamed collection '{old_name}' -> '{new_name}'.")


def rename_field(db, collection: str, query: dict, rename_map: dict, dry_run: bool) -> None:
    if dry_run:
        count = db[collection].count_documents(query)
        print(f"[dry-run] Would update {count} docs in '{collection}' with {rename_map}.")
        return
    result = db[collection].update_many(query, {"$rename": rename_map})
    print(f"Updated '{collection}': matched {result.matched_count}, modified {result.modified_count}.")


def migrate():
    dry_run = "--dry-run" in sys.argv
    client = MongoClient(settings.mongodb_url)
    db_name = _db_name_from_uri(settings.mongodb_url)
    db = client[db_name]

    print(f"Starting group migration for database: {db_name}")
    if dry_run:
        print("Running in dry-run mode. No changes will be applied.")

    rename_collection(db, "categories", "groups", dry_run)

    rename_field(
        db,
        "projects",
        {"category_id": {"$exists": True}},
        {"category_id": "group_id"},
        dry_run
    )
    rename_field(
        db,
        "tasks",
        {"category_id": {"$exists": True}},
        {"category_id": "group_id"},
        dry_run
    )
    rename_field(
        db,
        "users",
        {"access.category_ids": {"$exists": True}},
        {"access.category_ids": "access.group_ids"},
        dry_run
    )
    rename_field(
        db,
        "ai_insights",
        {"category_summaries": {"$exists": True}},
        {"category_summaries": "group_summaries"},
        dry_run
    )

    client.close()
    print("Group migration complete.")


if __name__ == "__main__":
    migrate()
