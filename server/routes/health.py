from fastapi import APIRouter

from routes.deps import utcnow

router = APIRouter(tags=["system"])


@router.get("/health")
def health():
    return {"status": "ok", "server_time": utcnow()}
