"""AwaVote API entrypoint. Run with:  uvicorn main:app --reload  (from the server/ directory)."""
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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


# Cross-origin isolation lets the on-device speech models run multi-threaded in the browser.
ISOLATION = {"Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless"}


def mount_pwa(app: FastAPI, out: Path) -> None:
    """Serve the static-export PWA with clean URLs (/verify -> verify.html), its 404 page, a
    never-cached service worker and long-cached hashed assets."""
    out = out.resolve()

    @app.middleware("http")
    async def isolation_headers(request: Request, call_next):
        response = await call_next(request)
        for k, v in ISOLATION.items():
            response.headers.setdefault(k, v)
        return response

    @app.get("/{path:path}", include_in_schema=False)
    async def pwa(path: str):
        for candidate in (path, f"{path}.html", f"{path}/index.html", "index.html" if not path else None):
            if not candidate:
                continue
            f = (out / candidate).resolve()
            if f.is_file() and f.is_relative_to(out):
                headers = {}
                if f.name == "sw.js":
                    headers["Cache-Control"] = "no-cache"
                elif "/_next/static/" in f.as_posix():
                    headers["Cache-Control"] = "public, max-age=31536000, immutable"
                return FileResponse(f, headers=headers)
        return FileResponse(out / "404.html", status_code=404)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"],
                       allow_headers=["*"], expose_headers=["X-Content-SHA256"])
    api = APIRouter(prefix="/api")
    for r in (health.router, speech.router, contrib.router, elections.router, evidence.router, incidents.router,
              results.router, results.official_router, system.router):
        api.include_router(r)
    app.include_router(api)
    # Speech models for on-device use. Phones download them once and then work offline.
    settings.models_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/asr-models", ImmutableStaticFiles(directory=settings.models_dir), name="asr-models")
    if settings.static_dir:
        mount_pwa(app, settings.static_dir)  # the PWA owns every other path (incl. its own /models/)
    else:
        app.mount("/models", ImmutableStaticFiles(directory=settings.models_dir), name="models")  # older clients
    return app


app = create_app()
