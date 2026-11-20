# AwaVote — write-up
**Every Vote. Every Count. Every Voice.** · Team 11 · KTech Fest 3.0 Hackathon

## 1. The problem
Results are counted at about 176,000 polling units. Each one pastes its result sheet (EC8A) on the
wall, then the results are uploaded to INEC's IReV portal, collated and declared. **Between the
wall and the declaration, citizens lose sight of their result.** People photograph the sheet, but
the photos stay private, can't be shown to be unedited, and nobody can compare them with what was
announced. Rumours fill the gap. Our problem brief (`01-problem-brief.md`) explains why this link
matters and who it affects.

## 2. The solution
**AwaVote is an offline-first app (installable PWA, works in any phone browser) that turns the
result-sheet photos people already take into checkable public evidence.** It speaks the voter's
language, hands-free.

### Core feature: track a result from the wall to the announcement
1. **CountCam.** Photograph the EC8A on the wall. The photo is fingerprinted (SHA-256) and
   time-stamped on the phone, even offline, so any later edit is detectable.
2. **Verify.** On-device OCR reads the sheet. AwaVote checks the EC8A arithmetic (accredited ≥
   votes cast, valid + rejected = total, party votes = total valid, …). Every problem is labelled
   *needs review*, never "fraud".
3. **Sync.** Records wait in an offline outbox and upload when there is signal. The server
   re-checks everything, issues an **HMAC-signed receipt** and writes a **hash-chained audit log**
   that detects tampering.
4. **Agreement.** Independent photos of the same polling unit are compared. The figure most of them
   agree on is "the wall". A mistyped photo doesn't change it.
5. **Wall vs announced.** Accredited observers enter the officially announced result (IReV image,
   collation sheet or announcement), with its link and their observer key. AwaVote shows, party by
   party, ✔ **matches** or ✘ **differs (+30 APC)**. The public "Track a result" page and the
   transparency dashboard (with CSV export) make this visible to voters, agents, CSOs, journalists
   and tribunals.

### Built for real Nigerian conditions
- **No network:**
  - Every page, the INEC data and the AI models are cached on the phone.
  - Records queue offline and sync later.
  - Tested with the network switched off.
- **Voters who don't read English:**
  - **Hands-free voice.** The microphone wakes when you speak, with no button. The app **detects
    which language you are speaking** (English, Pidgin, Yorùbá, Hausa, Igbo), switches its whole
    interface to that language, and acts: "fi àwọn olùdíje hàn mí" opens the candidates in Yorùbá.
  - Pages can be read aloud.
  - Interface text is translated with translation models: Hausa 62%, Igbo 58%, Yorùbá 43% and
    Pidgin 36% of screens. Each translation is kept only if it passes automatic quality checks
    (back-translation, protected terms, length); anything else stays in clear English.
- **Elderly voters and voters with low vision:** large text (four sizes), high contrast, dark mode,
  reduced motion, and voice instead of typing.
- **Accurate information against misinformation:** official 2027 dates (with a live countdown), all
  22 registered parties with their INEC logos, and **15,244 candidates** from INEC's published lists,
  with verified photos where freely licensed, each traceable to its INEC PDF. Voters can also
  report incidents, which are stored anonymously as *allegations* until reviewed.
- **Privacy:** speech, photos and OCR are processed on the phone. No audio ever leaves the device.
  Anonymous reports never store contact details.

## 3. How AI is used (all on the phone, all offline)
| Job | Model | How we use it |
|---|---|---|
| Which language is being spoken? | **Whisper-tiny** (OpenAI, int8) + **our language-ID head** | We trained a 65 KB classifier on Whisper's encoder and language scores, using FLEURS, Nigerian-accented English and Nigerian Pidgin speech. 90% on held-out clips; 10/10 on real Nigerian speakers (2 per language incl. Pidgin). |
| Speech → text in 4 languages + Pidgin | **N-ATLaS** Whisper-small fine-tunes (Awarri / Federal Government of Nigeria): Yoruba, Hausa, Igbo, Nigerian English | We converted them to int8 ONNX (291 MB each) and patched the encoder for **short audio windows (≈4× faster)**. They run in a Web Worker, one model in memory at a time. |
| Understanding commands | **AwaVote Nano** (ours, 370 KB ONNX) | Character n-gram classifier for 18 commands in 5 languages, trained on our phrases plus what the speech models actually transcribe. |
| Reading the EC8A sheet | **Tesseract** (LSTM, via Tesseract.js) | Pre-fills the form. People confirm every number. |
| Reading pages aloud | **Meta MMS-TTS** Yoruba (int8) + device voices | Offline read-aloud. |
| Translating the interface | **Meta NLLB-200** (Yorùbá, Hausa, Igbo) and **NITHUB-AI English→Pidgin MT** | Run offline at build time. A translation is kept only if its back-translation matches the English meaning, and election terms and names (votes, INEC, EC8A …) survive. Otherwise English is shown. |

**Hands-free decision logic:**
1. Voice-activity detection cuts out each phrase.
2. The language detector decides which language it is in.
3. That language's model transcribes it.
4. The command model decides what it means.
5. AwaVote only acts on clear commands. When the language is uncertain, it transcribes the phrase
   in each likely language and keeps the clearest command. Background talk is ignored.

## 4. Tools and technology
- **App:** Next.js 16 (static export), React 19, Tailwind CSS 4, a service worker for offline use,
  IndexedDB for the offline outbox, ONNX Runtime Web, Transformers.js, Tesseract.js and Web
  Audio. Speech recognition runs in a Web Worker.
- **Server:** FastAPI, SQLAlchemy and Alembic on SQLite, with HMAC receipts, a hash-chained audit
  log and rate limiting.
- **AI tooling:** PyTorch, Hugging Face Transformers and Optimum (ONNX export), ONNX Runtime
  quantisation, CTranslate2.
- **Testing:**
  - 40 client unit tests and 33 server tests;
  - an end-to-end test in real Chrome that drives the deployed configuration (36/37 checks,
    including spoken commands, wall-vs-announced, observer entry, camera and offline; see
    `06-test-report.md`).
- **Deployment:** Docker on Hugging Face Spaces. The app, API and speech models are served from
  one origin over HTTPS.

## 5. Credits (open-source libraries, pre-trained models, public datasets)
See `CREDITS.md` for the full list with licences. Highlights:
- **N-ATLaS** speech models © Awarri Technologies with the Federal Government of Nigeria
  (N-ATLaS Open-Source Research and Innovation License; the converted models are named
  "Powered by Awarri").
- Whisper (OpenAI, MIT), Meta MMS-TTS (CC-BY-NC 4.0), Meta NLLB-200 (CC-BY-NC 4.0),
  NITHUB-AI Pidgin MT (CC-BY 4.0), Tesseract (Apache 2.0).
- Speech datasets used to train language detection: Google FLEURS (CC-BY 4.0), the Nigerian
  Accented English dataset (Apache 2.0), Nigerian Pidgin 1.0 (CC-BY 4.0); evaluation samples from
  NaijaVox (Apache 2.0).
- INEC publications: 2027 timetable, party register, final candidate lists and party logos.
- Candidate photos: Wikimedia Commons, each with its author and licence shown in the app.

## 6. AI coding assistant declaration
We used **Claude Code (Anthropic)** as an AI coding assistant during the hackathon. It helped write
and test code, convert and benchmark the speech models, train the language detector and draft
documentation. The team directed the work, made the design decisions and reviewed the results.

## 7. What's next
- A **USSD/SMS channel** for basic phones, once a zero-rated short code is available.
- A **direct IReV feed** in place of observer entry.
- **Ward and LGA collation tracking** (EC8B–EC8E).
- **Native-speaker recordings** from `/contribute` to raise accuracy for more phrasings and more
  Nigerian languages.
- Pilots with observer groups and party-agent networks.
