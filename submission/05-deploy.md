# Deploying AwaVote (live demo link)

**Target:** a free **Hugging Face Docker Space**. One container serves the app, the API and the
speech models from one HTTPS origin. HTTPS is needed for the microphone and camera.

**Result:** `https://<your-username>-awavote.hf.space`

## One-time setup (about 15 minutes, mostly waiting)
1. **Create a Hugging Face write token.** Use the account that accepted the N-ATLaS terms. Go to
   https://huggingface.co/settings/tokens → *Create new token* → type **Write**. Copy it.
2. **Log in from the project folder,** and paste the token when asked:
   ```bash
   ai/.venv/bin/hf auth login
   ```
3. **Upload the converted speech models to a private model repo** (~1.2 GB; once):
   ```bash
   ai/.venv/bin/python deploy/upload_models.py <your-username>/awavote-asr-models
   ```
   The repo is private because the N-ATLaS licence gates the models. The Space reads it with your
   token.
4. **Create the Space and upload the app:**
   ```bash
   ai/.venv/bin/python deploy/push_space.py <your-username>/awavote <your-username>/awavote-asr-models
   ```
   The script prints the live link and the **observer key**, which is needed to enter announced
   results. Keep the key private.
   The script also sets these on the Space:
   - **secrets:** `HF_TOKEN`, `AWAVOTE_RECEIPT_SECRET` (random), `AWAVOTE_OBSERVER_KEY`;
   - **variables:** `AWAVOTE_MODELS_REPO`, and `AWAVOTE_SEED_DEMO=1`, which loads the labelled demo
     polling units `DEMO-001` and `DEMO-002`.
5. **Watch the build:** open `https://huggingface.co/spaces/<your-username>/awavote` → **Logs**. The
   first build takes about 10 minutes, then the app starts.

## Updating after code changes
Re-run step 4. It uploads the current source and the Space rebuilds. Your GitHub repository is
never touched by these scripts.

## Free-tier behaviour
- The Space sleeps after a period without visitors and wakes on the next visit (about 1 minute).
  Open the link a few minutes before judging or recording.
- The database (SQLite) is reset when the Space restarts. The demo data is reloaded automatically.

## Other hosts
Any Docker host works: `docker build -f deploy/Dockerfile -t awavote . && docker run -p 7860:7860 -e AWAVOTE_MODELS_REPO=… -e HF_TOKEN=… awavote`.
To host the app separately as static files instead, build with `NEXT_PUBLIC_API_URL=https://your-api`,
add that origin to `AWAVOTE_CORS_ORIGINS` on the API, and serve every file with
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`.
