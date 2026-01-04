import pytest
import asyncio
from datetime import datetime
from fastapi.testclient import TestClient
from backend.app.main import app
from bson import ObjectId

client = TestClient(app)

@pytest.mark.asyncio
async def test_project_update_activity_log():
    # Create a new project
    create_resp = client.post(
        "/api/projects",
        json={
            "name": "Test Project",
            "description": "Initial description",
            "status": "ongoing",
            "group_id": "000000000000000000000000",  # dummy group id
            "start_date": "2025-01-01",
            "end_date": "2025-12-31"
        },
        headers={"Authorization": "Bearer testtoken"}
    )
    assert create_resp.status_code == 200
    project = create_resp.json()
    project_id = project["_id"]

    # Update the project name and due date
    update_resp = client.put(
        f"/api/projects/{project_id}",
        json={"name": "Updated Project", "end_date": "2026-01-01"},
        headers={"Authorization": "Bearer testtoken"}
    )
    assert update_resp.status_code == 200
    updated_project = update_resp.json()

    # Check activity log
    activity = updated_project.get("activity", [])
    assert len(activity) > 0
    last_entry = activity[0]
    assert "description" in last_entry
    assert "changed the name of this project to Updated Project" in last_entry["description"]
    assert "changed the due date of this project to 01 Jan 2026" in last_entry["description"]
    assert last_entry["user"] is not None
    assert "timestamp" in last_entry
    
    # Check changes details
    changes = last_entry.get("changes", [])
    fields = [change["field"] for change in changes]
    assert "Name" in fields
    assert "Due Date" in fields
    
    # Cleanup: delete the project
    del_resp = client.delete(f"/api/projects/{project_id}", headers={"Authorization": "Bearer testtoken"})
    assert del_resp.status_code == 200
