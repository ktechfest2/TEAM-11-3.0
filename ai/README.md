# AwaVote Nano: AI workspace

This folder holds the training data, training code, evaluation results and model cards for the on-device AI. It is kept separate from the app. The browser runtime lives in `client/lib/nano/` and only consumes the exported artifacts.

```
datasets/intents_seed.json   seed command utterances (en, pcm, yo, ha, ig); NOT native-reviewed
intent/featurizer.py         featuriser; must match client/lib/nano/intent/featurizer.js
intent/train.py              trains the classifier and exports client/public/models/nano/*
evaluation/                  reports and the benchmark table
model_cards/                 one card per model
speech_to_text/              ASR options, status and gaps
text_to_speech/              TTS options, status and gaps
```

Retrain after editing the dataset:

```bash
python3 -m venv ai/.venv && ai/.venv/bin/pip install numpy onnx onnxruntime
ai/.venv/bin/python -I ai/intent/train.py
cd client && npm test   # includes the featuriser parity tests against the Python output
```
