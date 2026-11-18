import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

from core.config import get_settings  # noqa: E402
from database import session as db_session  # noqa: E402
from database.session import Base, get_db, make_engine  # noqa: E402
from main import create_app  # noqa: E402

REPO_ROOT = SERVER.parent


@pytest.fixture()
def client(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "storage_dir", tmp_path / "storage")
    monkeypatch.setattr(settings, "rate_limit_per_minute", 10_000)
    engine = make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app = create_app()
    app.dependency_overrides[get_db] = _get_db
    monkeypatch.setattr(db_session, "SessionLocal", TestSession)
    with TestClient(app) as c:
        c.session_factory = TestSession
        yield c
