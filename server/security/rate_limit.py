"""Simple in-memory token-bucket rate limiter per client IP.

Adequate for a single-process local deployment. A multi-instance deployment needs a
shared store (e.g. Redis) instead.
"""
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, per_minute: int):
        super().__init__(app)
        self.capacity = float(per_minute)
        self.refill = per_minute / 60.0
        self.buckets: dict[str, tuple[float, float]] = defaultdict(lambda: (self.capacity, time.monotonic()))

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/") or request.url.path == "/api/health":
            return await call_next(request)
        key = request.client.host if request.client else "unknown"
        tokens, last = self.buckets[key]
        now = time.monotonic()
        tokens = min(self.capacity, tokens + (now - last) * self.refill)
        if tokens < 1:
            self.buckets[key] = (tokens, now)
            return JSONResponse({"detail": "Too many requests. Please retry shortly."}, status_code=429,
                                headers={"Retry-After": "5"})
        self.buckets[key] = (tokens - 1, now)
        return await call_next(request)
