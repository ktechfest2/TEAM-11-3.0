# Evaluation

- `intent_report.json` is produced by `ai/intent/train.py`. It contains per-language held-out accuracy and the list of misclassifications.
- The device benchmarks below are **still to be done**. Record the results here, along with the device model, browser version and RAM:

| Metric | Target | Measured |
|---|---|---|
| Intent model size | < 10 MB | 0.37 MB |
| Intent inference latency (2 GB Android) | < 50 ms | not measured |
| Whisper-tiny peak memory | < 100 MB combined voice | not measured |
| Whisper-tiny real-time factor (3 s command) | < 1.0 | not measured |
| App cold start, offline | < 3 s | not measured |
