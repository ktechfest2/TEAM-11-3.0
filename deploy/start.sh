#!/bin/sh
# Container entrypoint: fetch speech models (once), migrate the database, optionally load the
# labelled demo data, then serve the API + PWA on port 7860.
set -e
cd /home/user/app/server
MODELS="${AWAVOTE_MODELS_DIR:-/home/user/app/server/data/models}"
if [ -n "$AWAVOTE_MODELS_REPO" ] && [ ! -f "$MODELS/registry.json" ]; then
  echo "Fetching speech models from $AWAVOTE_MODELS_REPO …"
  python -c "
import os
from huggingface_hub import snapshot_download
snapshot_download(os.environ['AWAVOTE_MODELS_REPO'], repo_type='model', local_dir='$MODELS', token=os.environ.get('HF_TOKEN'))
"
fi
alembic upgrade head
if [ "$AWAVOTE_SEED_DEMO" = "1" ]; then python scripts/seed_demo.py; fi
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-7860}" --proxy-headers --forwarded-allow-ips="*"
