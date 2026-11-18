# Speech-to-text (ASR): options and status

The client interface is `client/lib/nano/asr/index.js`. Each provider implements `listen({lang, signal, onLevel, onState}) → {text, confidence, provider, offline, latencyMs}`. Voice activity detection and endpointing live in `asr/recorder.js` and are independent of the model, so the model can be replaced without touching the UI.

## Providers implemented
| Provider | Offline | Languages | Status |
|---|---|---|---|
| `whisper-local`: `onnx-community/whisper-tiny`, int8, via Transformers.js on ONNX Runtime Web | Yes, after a one-time ~41 MB download | en, yo, ha (pcm is transcribed as English) | Works. Accuracy for Yoruba and Hausa from the tiny model is known to be poor. |
| `webspeech-online`: browser `SpeechRecognition` | **No.** Chrome sends audio to Google | Whatever the browser supports | Off by default. The user must opt in. |

## Candidate models (verified November 2026)
| Model | Size (int8) | Licence | Notes |
|---|---|---|---|
| whisper-tiny | 10 MB encoder + 31 MB decoder | MIT | No Igbo support. Weak on yo and ha. |
| whisper-base | 23 MB + 54 MB | Apache-2.0 tag on the ONNX repo (Whisper itself is MIT) | Better accuracy, but too large for 2 GB phones |
| NaijaVox (research) | Whisper-based, large | Check before use | Per the brief, **not** bundled as the default low-end model |

## Gaps and next steps
1. **Igbo and Pidgin have no offline ASR yet.** Options:
   - fine-tune whisper-tiny on Nigerian speech (for example NaijaVoices or AfriSpeech, licences permitting)
   - use a small CTC model (wav2vec2 or MMS adapters), quantized and exported to ONNX
2. Command recognition only needs a closed vocabulary. A keyword-spotting model trained on the command set (well under 5 MB) may beat general ASR on low-end phones.
3. Whisper exposes no calibrated confidence through Transformers.js. For now, intent confidence gates every action. A future step is to compute average token log-probability.
4. Benchmark on real 2 GB Android phones: model load time, real-time factor and peak RSS.
