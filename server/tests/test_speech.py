import json

from core.config import get_settings


def test_speech_registry_empty_by_default(client, tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "models_dir", tmp_path / "models")
    assert client.get("/api/speech/models").json() == {"models": []}


def test_speech_registry_lists_hosted_models(client, monkeypatch, tmp_path):
    d = tmp_path / "m"
    d.mkdir()
    (d / "registry.json").write_text(json.dumps({"models": [{"id": "natlas-asr-yo-int8", "languages": ["yo"],
                                                             "name": "AwaVote Yoruba ASR (int8) Powered by Awarri"}]}))
    monkeypatch.setattr(get_settings(), "models_dir", d)
    models = client.get("/api/speech/models").json()["models"]
    assert models[0]["languages"] == ["yo"] and models[0]["name"].endswith("Powered by Awarri")


def test_model_files_served_with_long_cache(client):
    d = get_settings().models_dir / "pytest-model"
    d.mkdir(parents=True, exist_ok=True)
    (d / "config.json").write_text("{}")
    try:
        r = client.get("/models/pytest-model/config.json")
        assert r.status_code == 200 and "immutable" in r.headers["cache-control"]
    finally:
        (d / "config.json").unlink()
        d.rmdir()
