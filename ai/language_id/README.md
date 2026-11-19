# Spoken-language detection

AwaVote follows the language the user speaks: no language menu needed. Before a phrase is
transcribed, a small classifier decides which language it is in, then the matching N-ATLaS
speech model transcribes it.

## How it works
- Whisper on its own cannot tell Yoruba, Hausa or Igbo apart. It labels them French, Māori,
  Chinese and so on. Its English detection is reliable (0.95+).
- So AwaVote adds a linear classifier (`client/public/models/nano/lid-v1.json`, 65 KB) on top of
  the Whisper-tiny model that already ships with the app (`client/lib/nano/lid.js`). It uses two
  inputs from one encoder pass:
  - Whisper's 99 language scores;
  - the mean encoder output ("voice fingerprint", 384 values).
- Classes: `en` (English **or Pidgin**, which share one speech model), `yo`, `ha`, `ig`.
  English vs Pidgin is then decided from the words by the command classifier.
- Runs on the phone, offline, in about 1 s.

## Training data (all openly licensed)
| Source | Use | Licence |
|---|---|---|
| FLEURS dev: `en_us`, `yo_ng`, `ha_ng`, `ig_ng` (first ~60 MB of each) | train + held-out test | CC-BY 4.0 |
| `benjaminogbonna/nigerian_accented_english_dataset` (test + validation) | train + test (English family) | Apache-2.0 |
| `asr-nigerian-pidgin/nigerian-pidgin-1.0` (validation) | train + test (English family) | CC-BY 4.0 |
| `Axiveri/NaijaVox-2.0` audio samples (10 real speakers) | evaluation only | Apache-2.0 |

Clips are cropped to 1.5–5 s to resemble voice commands. Classes are weighted equally.

## Results (v1, 2026-11-19)
| Test set | Accuracy |
|---|---|
| Held-out clips, all classes | 90% |
| …US English / Nigerian-accented English / Pidgin | 96% / 100% / 80% |
| …Yoruba / Hausa / Igbo | 87% / 93% / 82% |
| Real NaijaVox speakers (2 per language incl. Pidgin) | 10/10 |

## Limits
- Held-out clips come from the same datasets as the training data. Real-world accuracy is not
  yet measured.
- Synthetic test voices are harder. The MMS Igbo voice is detected as Yoruba, so Igbo
  commands spoken by it are ignored. They are ignored safely: nothing happens.
- When the detector is unsure (< 0.6), the app transcribes the phrase in each plausible language
  and keeps the most confident command. When nothing is a clear command, it does nothing.

## Reproduce
```bash
ai/language_id/fetch_data.sh /path/to/lid-data          # ~400 MB download
ai/.venv/bin/python -I ai/language_id/train_lid.py \
  client/public/models/hf/onnx-community/whisper-tiny /path/to/lid-data \
  client/public/models/nano/lid-v1.json [optional/dir/of/extra/test/wavs]
```
