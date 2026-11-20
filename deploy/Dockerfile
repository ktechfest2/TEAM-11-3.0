# AwaVote — one container: the PWA + the API + the on-device speech models, on one origin.
# Built and run by a Hugging Face Docker Space (port 7860), or anywhere Docker runs.

# ---------- 1. Build the PWA (static export) ----------
FROM node:22-bookworm-slim AS web
WORKDIR /src/client
COPY client/package.json client/package-lock.json client/.npmrc ./
RUN npm ci
COPY client/ ./
# "/" = the API and speech models are served by the same host as the app.
ENV NEXT_PUBLIC_API_URL=/
# Also downloads the bundled Whisper-tiny and Yoruba voice from Hugging Face (scripts/fetch-models.mjs).
RUN npm run build

# ---------- 2. API server that also serves the PWA ----------
FROM python:3.14-slim
RUN useradd -m -u 1000 user
WORKDIR /home/user/app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt "huggingface_hub>=0.30"
COPY --chown=user server/ server/
COPY --chown=user --from=web /src/client/out web/
COPY --chown=user deploy/start.sh start.sh
COPY --chown=user deploy/seed_demo.py server/scripts/seed_demo.py
RUN chmod +x start.sh
USER user
ENV AWAVOTE_STATIC_DIR=/home/user/app/web \
    AWAVOTE_ENVIRONMENT=production \
    PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["./start.sh"]
