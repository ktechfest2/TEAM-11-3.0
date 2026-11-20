# AwaVote

**Every Vote. Every Count. Every Voice.**

AwaVote is an offline-first, multilingual election-transparency Progressive Web App (PWA) for Nigeria. "Awa" is Nigerian Pidgin for "our".

**The weak link it strengthens:** the journey of a result from the sheet pasted on the polling-unit
wall (EC8A) to the number that is finally announced.

- **Snap** the EC8A on the wall. The photo is fingerprinted on the phone, even offline.
- **Check** that its figures add up, using on-device OCR and arithmetic checks.
- **Agree:** independent photos of the same polling unit are compared.
- **Compare:** accredited observers enter the announced result (IReV or collation). AwaVote shows,
  party by party, whether **the announcement matches the wall**.
- **Inform and report:** official 2027 dates, the 22 parties and 15,244 candidates (with photos and
  party logos), and incident reports.

All of this works on low-end phones, without an internet connection, by touch or **hands-free by
voice** in English, Pidgin, Yorùbá, Hausa and Igbo. The app detects the language you speak.

**Submission documents:** [`submission/`](submission/): problem brief, system sketch, write-up,
demo script, deployment guide, credits.
**Live demo:** _add the Hugging Face Space link here after deploying (see `submission/05-deploy.md`)._

> AwaVote never presents its data as official results. Submissions are *independent*. Incident reports are *allegations* until reviewers check them. An arithmetic mismatch means *needs review*, never fraud.


## start instruction
```bash
# Backend ( API docs at /docs)
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head
.venv/bin/uvicorn main:app --reload

# Frontend
cd client
npm install         runtime assets into public/
npm run dev

# Frontend, production / offline test (service worker active)
npm run build && npm start     # serves the static export (out/) on :3000
```
The camera and microphone need a secure context. `localhost` counts as secure. To test on a phone over the LAN, serve over HTTPS, for example through a reverse proxy with a local certificate. Set `NEXT_PUBLIC_API_URL` if the API is not on `<same host>:8000`.

## Tests
```bash
cd server && .venv/bin/python -m pytest      # API, idempotency, integrity, audit chain, validation
cd client && npm test                        # validation, featuriser parity, image pipeline, OCR parser, router, sync engine
```

## AwaVote Nano (on-device AI)
AwaVote Nano is a command engine, **not a chatbot**. The pipeline runs these steps:
1. capture audio, with voice activity detection
2. convert speech to text on the device
3. identify the language and the intent
4. route the intent to an app action
5. ask for confirmation before sensitive actions, or for clarification when confidence is low
6. give a short spoken response

Everything runs on the phone:
- **Language detection:** Whisper-tiny plus our 65 KB classifier (`ai/language_id/`).
- **Speech recognition:** four N-ATLaS models (Awarri / FGN), converted to int8 with a short-window
  encoder. They run in a Web Worker (`ai/speech_to_text/`).
- **Command model:** 370 KB ONNX, run with ONNX Runtime Web.
- **OCR:** Tesseract.js.
- **Read-aloud:** MMS-TTS.

Hands-free mode listens while the app is open, acts only on clear commands, and never sends audio
off the device. See `ai/README.md` and the model cards for sizes, licences and measured accuracy.

## Elections 2027 and languages
- **Real election data.** AwaVote includes the official 2027 dates, all 22 registered parties, and every candidate INEC published for President, Governor (28 states), Senate, House of Representatives and State Houses of Assembly: 15,244 entries, each traceable to its INEC PDF. ResultVerify loads the official ballot for the chosen contest. See `docs/election-data.md`.
- **Languages.** English, Pidgin, Yorùbá, Hausa and Igbo. Interface text is translated with NLLB-200 and NITHUB Pidgin MT behind automatic quality checks (`ai/translation/`), with English for the rest. Speech uses the N-ATLaS models. Native speakers can add phrasings and recordings for more languages in `/contribute`.

## Deploying
One container serves the app, the API and the speech models from one HTTPS origin: `deploy/Dockerfile` on a Hugging Face Space. Step by step: `submission/05-deploy.md`. For a single-origin run locally: build the client with `NEXT_PUBLIC_API_URL=/`, then start the API with `AWAVOTE_STATIC_DIR=../client/out`. Announced results need `AWAVOTE_OBSERVER_KEY`.

