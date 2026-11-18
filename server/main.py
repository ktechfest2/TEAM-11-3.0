"""AwaVote API entrypoint. Run with:  uvicorn main:app --reload  (from the server/ directory)."""
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import get_settings
from routes import contrib, elections, evidence, health, incidents, results, speech, system
from security.rate_limit import RateLimitMiddleware


class ImmutableStaticFiles(StaticFiles):
    """Model files are versioned by folder name, so browsers may cache them forever."""
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"],
                       allow_headers=["*"], expose_headers=["X-Content-SHA256"])
    api = APIRouter(prefix="/api")
    for r in (health.router, speech.router, contrib.router, elections.router, evidence.router, incidents.router, results.router, system.router):
        api.include_router(r)
    app.include_router(api)
    # Speech models for on-device use. Phones download them once and then work offline.
    settings.models_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/models", ImmutableStaticFiles(directory=settings.models_dir), name="models")
    return app


app = create_app()
