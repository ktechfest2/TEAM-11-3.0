# Speech-to-text

Speech is set up automatically on users' phones. See `docs/speech.md` for the user experience, hosting and licence.

## Recognisers
| Language | Model | Where it runs |
|---|---|---|
| en, pcm, yo, ha, ig | N-ATLaS Whisper-small fine-tunes (Awarri / FGN), converted to int8 ONNX by `convert_natlas.py` and served by the AwaVote server | On the phone (Transformers.js / ONNX Runtime Web), offline after one download |
| en, pcm, yo, ha (interim) | `onnx-community/whisper-tiny` (MIT) | Same |
| All other languages | Native-speaker command templates (`client/lib/nano/asr/features.js`) | Same |

## Converter: verified
`convert_natlas.py` was tested end to end on the public `openai/whisper-tiny`:
1. The conversion completed: download → ONNX export → int8, including sub-graphs.
2. The output was 64 MB.
3. The AwaVote server hosted it, and the app downloaded it automatically.
4. The JFK sample clip was played into Chrome as microphone input and transcribed correctly on the device.

Notes:
- Expected N-ATLaS output size: roughly 250–300 MB per language.
- On Python 3.14, the script patches an Optimum incompatibility: `functools.partial` class attributes became method descriptors in 3.14.

To run it for N-ATLaS, set `HF_TOKEN` to a token from an account that has accepted Awarri's terms.

## Gaps
- **Pidgin:** no dedicated model; it uses Nigerian-accented English.
- **Other languages:** no dedicated models; they rely on native-speaker templates.
- **Accuracy:** not yet measured on AwaVote commands. Use the accuracy-test tool in `/contribute`.
- **Licence:** the N-ATLaS licence caps use at 1,000 active users per 30 days without a commercial agreement.
