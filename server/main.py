"""AwaVote API entrypoint. Run with:  uvicorn main:app --reload  (from the server/ directory)."""
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from routes import contrib, elections, evidence, health, incidents, results, system
from security.rate_limit import RateLimitMiddleware


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"],
                       allow_headers=["*"], expose_headers=["X-Content-SHA256"])
    api = APIRouter(prefix="/api")
    for r in (health.router, contrib.router, elections.router, evidence.router, incidents.router, results.router, system.router):
        api.include_router(r)
    app.include_router(api)
    return app


app = create_app()
