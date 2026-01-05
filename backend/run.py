"""
Run the FastAPI server
Usage: python run.py
"""
import os
import uvicorn

if __name__ == "__main__":
    reload = os.getenv("RELOAD", "").lower() in {"1", "true", "yes"}
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=reload
    )
