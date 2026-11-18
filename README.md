# AwaVote

**Every Vote. Every Count. Every Voice.**

AwaVote is an offline-first, multilingual election-transparency Progressive Web App (PWA) for Nigeria. "Awa" is Nigerian Pidgin for "our".

It helps citizens and observers do four things:
- photograph publicly displayed result sheets as evidence that can be checked for tampering
- check that the figures on an EC8A sheet add up
- report incidents
- read voter-education information

All of this works on low-end phones, without an internet connection, by touch or by voice.

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

The core intent model is a 370 KB ONNX model run with ONNX Runtime Web. Speech packs are optional downloads. See `ai/README.md` and the model cards for sizes, licences and the honest accuracy picture: **Nigerian-language support is not yet validated by native speakers.**

## Elections 2027 and languages
- **Real election data.** AwaVote includes the official 2027 dates, all 22 registered parties, and every candidate INEC published for President, Governor (28 states), Senate, House of Representatives and State Houses of Assembly: 15,244 entries, each traceable to its INEC PDF. ResultVerify loads the official ballot for the chosen contest. See `docs/election-data.md`.
- **Languages.** The target is the languages ~90% of Nigerians use. Native speakers translate, record and test their language in `/contribute`. Voice commands for any language run on the device from their recordings. A language is marked supported only at ≥ 90% accuracy measured on speakers whose voices are not in the recordings. See `docs/languages.md`.

