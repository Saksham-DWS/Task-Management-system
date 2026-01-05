from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager, suppress
import asyncio

from .database import connect_to_mongo, close_mongo_connection
from .config import settings
from .services.ai_scheduler import run_ai_scheduler
from .routes import (
    auth_router,
    users_router,
    groups_router,
    projects_router,
    tasks_router,
    notifications_router,
    ai_router
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_to_mongo()
    scheduler_task = asyncio.create_task(run_ai_scheduler())
    yield
    # Shutdown
    scheduler_task.cancel()
    with suppress(asyncio.CancelledError):
        await scheduler_task
    await close_mongo_connection()


app = FastAPI(
    title="DWS Project Manager API",
    description="Backend API for DWS Project Manager",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
allowed_origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]
if not allowed_origins:
    allowed_origins = ["http://localhost:3000"]
allow_credentials = "*" not in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=800)

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(groups_router)
app.include_router(projects_router)
app.include_router(tasks_router)
app.include_router(notifications_router)
app.include_router(ai_router)


@app.get("/")
async def root():
    return {"message": "DWS Project Manager API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
