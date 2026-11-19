# Speech-to-text

Speech is set up automatically on users' phones. See `docs/speech.md` for the user experience, hosting and licence.

## Recognisers
| Language | Model | Where it runs |
|---|---|---|
| en, pcm, yo, ha, ig | N-ATLaS Whisper-small fine-tunes (Awarri / FGN), converted to int8 ONNX by `convert_natlas.py` and served by the AwaVote server | On the phone (Transformers.js / ONNX Runtime Web), offline after one download |
| en, pcm, yo, ha (interim) | `onnx-community/whisper-tiny` (MIT) | Same |
| All other languages | Native-speaker command templates (`client/lib/nano/asr/features.js`) | Same |

## N-ATLaS models: converted and live (2026-11-19)
All four N-ATLaS models are converted (int8 ONNX, 291 MB each) and served from `server/data/models/`:

| Model id | Languages | Check on the converted (int8) model |
|---|---|---|
| `natlas-asr-en-int8` | en, pcm | JFK clip transcribed word for word |
| `natlas-asr-yo-int8` | yo | Yoruba sentence (MMS-TTS) correct except one word, tone marks kept |
| `natlas-asr-ha-int8` | ha | Hausa sentence (MMS-TTS) correct except the last word |
| `natlas-asr-ig-int8` | ig | Output matches Awarri's original fp32 model on the same clip. Accuracy not confirmed: no good Igbo test voice is available, so test with real speakers |

The app picks the right model per language automatically and loads it in the background (no button).
Phones with 2 GB of memory or less keep the 41 MB Whisper-tiny instead.

## Running the converter
```bash
ai/.venv/bin/hf auth login        # account must have accepted Awarri's terms on all four model pages
HF_HUB_DISABLE_XET=1 ai/.venv/bin/python ai/speech_to_text/convert_natlas.py --langs yo ha ig en
```
- Weights are ~1 GB per language. `HF_HUB_DISABLE_XET=1` makes interrupted downloads resume over plain HTTP (xet transfers can hang on a flaky connection).
- Each heavy step (export, int8 quantisation, decoder merge) runs in its own process, and the decoders are quantised before merging. Peak memory is about 4.7 GB; in one process it was over 5 GB and was OOM-killed.
- Temporary files go to `server/data/.convert-*`, not `/tmp`, which can be RAM-backed.
- Python 3.14: the script patches an Optimum incompatibility (`functools.partial` class attributes became method descriptors).
- The converter was first validated end to end on `openai/whisper-tiny`, including on-device transcription in Chrome.

## Gaps
- **Pidgin:** no dedicated model; it uses Nigerian-accented English.
- **Other languages:** no dedicated models; they rely on native-speaker templates.
- **Accuracy:** checked on single synthetic sentences only (see above), not yet on real voters' AwaVote commands. Use the accuracy-test tool in `/contribute`, especially for Igbo.
- **Licence:** the N-ATLaS licence caps use at 1,000 active users per 30 days without a commercial agreement.
