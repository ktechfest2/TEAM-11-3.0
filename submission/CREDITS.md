# Credits

AwaVote was built during the hackathon. It stands on these open-source libraries, pre-trained
models, public datasets and public data.

## Pre-trained AI models
| Model | By | Licence | Used for |
|---|---|---|---|
| N-ATLaS Yoruba-ASR, Hausa-ASR, Igbo-ASR, NigerianAccentedEnglish (Whisper-small fine-tunes) | Awarri Technologies with the Federal Government of Nigeria (NCAIR1 on Hugging Face) | N-ATLaS Open-Source Research and Innovation License | On-device speech recognition. Converted to int8 ONNX and named "… Powered by Awarri", as the licence requires |
| whisper-tiny (`onnx-community/whisper-tiny`) | OpenAI | MIT | Base for our spoken-language detector; fallback speech recognition |
| MMS-TTS Yoruba (`Xenova/mms-tts-yor`) | Meta | CC-BY-NC 4.0 | Offline read-aloud in Yorùbá |
| NLLB-200 distilled 600M (`facebook/nllb-200-distilled-600M`, CTranslate2 int8 build by JustFrederik) | Meta | CC-BY-NC 4.0 | Translating the interface into Yorùbá, Hausa and Igbo (offline, at build time) |
| `NITHUB-AI/marian-mt-bbc-en-pcm` | NITHUB-AI (University of Lagos) | CC-BY 4.0 | Translating the interface into Nigerian Pidgin |
| Tesseract LSTM English (`@tesseract.js-data/eng`) | Tesseract OCR | Apache 2.0 | Reading EC8A result sheets on the phone |
| MMS-TTS English, Hausa; `waxal-benchmarking/mms-tts-ibo-rnjema101` | Meta / WAXAL | CC-BY-NC 4.0 | Testing only: synthetic voices for automated voice tests |

Models we built: **AwaVote Nano** (command classifier) and **AwaVote language ID** (spoken-language
classifier on top of Whisper-tiny).

## Datasets
| Dataset | Licence | Used for |
|---|---|---|
| Google FLEURS (`en_us`, `yo_ng`, `ha_ng`, `ig_ng`) | CC-BY 4.0 | Training and testing the language detector |
| `benjaminogbonna/nigerian_accented_english_dataset` | Apache 2.0 | Language detector (Nigerian English) |
| `asr-nigerian-pidgin/nigerian-pidgin-1.0` | CC-BY 4.0 | Language detector (Nigerian Pidgin) |
| `Axiveri/NaijaVox-2.0` audio samples | Apache 2.0 | Evaluation only (real Nigerian speakers) |

## Public data
- **INEC:** 2027 election timetable, register of political parties and party logos, and final lists
  of nominated candidates (President, Governor, Senate, House of Representatives, State Houses of
  Assembly). Each record links to its INEC PDF.
- **Wikimedia Commons / Wikidata:** candidate photos (CC-BY, CC-BY-SA, CC0 or public domain),
  credited per photo in the app.

## Libraries and tools
Next.js, React, Tailwind CSS, ONNX Runtime Web, Transformers.js (Hugging Face), Tesseract.js, idb,
sharp, Vitest, ESLint. FastAPI, Uvicorn, SQLAlchemy, Alembic, Pydantic, httpx, pytest.
PyTorch, Hugging Face Transformers, Optimum, ONNX, ONNX Runtime, CTranslate2, SentencePiece,
soundfile, PyArrow. Docker, Hugging Face Spaces.

## AI coding assistant
Claude Code (Anthropic) was used as an AI coding assistant. See section 6 of the write-up.
