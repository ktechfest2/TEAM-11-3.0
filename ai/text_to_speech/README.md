# Text-to-speech (TTS): options and status

The client interface is `client/lib/nano/tts/index.js`. It provides `speak(text, {lang, rate, key})`, `pause`, `resume`, `stop` and `replay`. Providers are tried in this order:

1. **Pre-recorded audio.** Clips at `public/audio/<lang>/<key>.mp3` are listed in `public/audio/manifest.json`, keyed by i18n message key. This is the best quality and needs no inference, so it is the recommended route for frequent prompts. **No recordings exist yet**: the manifest is empty.
2. **`mms-local`.** `Xenova/mms-tts-yor`, Meta MMS-TTS Yoruba, VITS, int8, 38 MB. It runs through Transformers.js. **Its licence is CC-BY-NC-4.0, which forbids commercial use.** It is opt-in only.
3. **Device voice.** This is `speechSynthesis`, and it works offline on most phones. Nigerian English voices are sometimes available. Yoruba, Hausa and Igbo voices are rare.

If no provider can speak the selected language, the UI shows the text and says no voice is available. It never reads Yoruba text with an English voice.

## Investigated
| Model | Size | Licence | Notes |
|---|---|---|---|
| MMS-TTS yor (ONNX) | 38 MB q8 | CC-BY-NC-4.0 | Integrated, opt-in |
| MMS-TTS hau / ibo | ONNX export not published | CC-BY-NC-4.0 | Would need conversion with optimum |
| Murivo-TTS Octa | Not verified | Not verified | Per the brief, benchmark before integrating. Not yet evaluated. |

## Next steps
1. Record the ~40 most frequent prompts with native speakers in all five languages. This gives the best quality at the lowest cost.
2. Find or train a commercially licensed compact TTS for yo, ha and ig, for example a Piper or VITS model trained on openly licensed Nigerian speech.
3. Benchmark the real-time factor and memory use on 2 GB phones.
