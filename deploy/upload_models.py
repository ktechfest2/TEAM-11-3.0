"""Upload the converted N-ATLaS speech models (server/data/models) to a PRIVATE Hugging Face model
repo, from which the deployed server fetches them at start-up. Private on purpose: N-ATLaS is gated
by Awarri's licence, so the converted files must not be published openly.

    ai/.venv/bin/hf auth login              # a token with WRITE access
    ai/.venv/bin/python deploy/upload_models.py <your-hf-username>/awavote-asr-models
"""
import sys
from pathlib import Path

from huggingface_hub import HfApi

repo = sys.argv[1]
src = Path(__file__).resolve().parents[1] / "server" / "data" / "models"
api = HfApi()
api.create_repo(repo, repo_type="model", private=True, exist_ok=True)
# Resumable, chunked upload: safe on a slow or flaky connection (re-run to continue).
api.upload_large_folder(repo_id=repo, repo_type="model", folder_path=str(src), ignore_patterns=[".*", "**/.*", "**/.cache/**"],
                        num_workers=4)
print(f"uploaded {src} -> https://huggingface.co/{repo} (private)")
