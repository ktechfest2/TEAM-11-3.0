"""Publish AwaVote as a Hugging Face Docker Space (live demo link: https://<user>-<space>.hf.space).

Creates/updates the Space, uploads the source (no build output, no models, no local data) plus a
Space README, and sets the Space secrets. It does NOT touch your GitHub repository.

    ai/.venv/bin/hf auth login              # a token with WRITE access
    ai/.venv/bin/python deploy/push_space.py <user>/awavote <user>/awavote-asr-models
"""
import os
import secrets
import shutil
import sys
import tempfile
from pathlib import Path

from huggingface_hub import HfApi, get_token

space, models_repo = sys.argv[1], sys.argv[2]
root = Path(__file__).resolve().parents[1]
api = HfApi()
api.create_repo(space, repo_type="space", space_sdk="docker", exist_ok=True)

with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    # Exact paths (relative to the repo) that never go to the Space: build output, local data, models.
    skip_paths = {"client/node_modules", "client/.next", "client/out", "client/public/models/hf", "client/public/ort",
                  "client/public/ort-tf", "client/public/tesseract", "client/public/vendor", "server/.venv",
                  "server/data/models", "server/storage"}
    skip_names = {"__pycache__", ".env", "awavote.db", "awavote.db-shm", "awavote.db-wal"}

    def ignore(d, names):
        rel = Path(d).resolve().relative_to(root).as_posix()
        return [n for n in names if n in skip_names or f"{rel}/{n}" in skip_paths]

    shutil.copytree(root / "client", t / "client", ignore=ignore)
    shutil.copytree(root / "server", t / "server", ignore=ignore)
    shutil.copytree(root / "deploy", t / "deploy")
    shutil.copy(root / "deploy" / "Dockerfile", t / "Dockerfile")
    shutil.copy(root / ".dockerignore", t / ".dockerignore")
    shutil.copy(root / "deploy" / "SPACE_README.md", t / "README.md")
    api.upload_folder(repo_id=space, repo_type="space", folder_path=tmp, commit_message="Deploy AwaVote")

# Secrets: read token for the private models repo, a random receipt-signing secret, the observer key.
observer_key = os.environ.get("AWAVOTE_OBSERVER_KEY") or secrets.token_urlsafe(18)
for k, v in {"HF_TOKEN": get_token(), "AWAVOTE_RECEIPT_SECRET": secrets.token_hex(32), "AWAVOTE_OBSERVER_KEY": observer_key}.items():
    api.add_space_secret(space, k, v)
for k, v in {"AWAVOTE_MODELS_REPO": models_repo, "AWAVOTE_SEED_DEMO": "1"}.items():
    api.add_space_variable(space, k, v)
user, name = space.split("/")
print(f"Space: https://huggingface.co/spaces/{space}")
print(f"Live demo (after the build, ~10 min): https://{user}-{name}.hf.space".lower().replace("_", "-"))
print(f"Observer key (keep private; needed to enter announced results): {observer_key}")
