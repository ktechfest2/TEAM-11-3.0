# Model card: AwaVote Nano intent classifier (v1, seed)

| | |
|---|---|
| Task | Map a short command (typed or transcribed) to one of 18 app intents, and identify its language (en / pcm / yo / ha / ig) |
| Architecture | Hashed character 2–4-grams + word uni/bigrams (4,096 buckets, FNV-1a) → two linear softmax heads |
| Format | ONNX (opset 17), float32, run with ONNX Runtime Web (WASM, single thread) |
| Size | **≈ 370 KB** (target was < 10 MB) |
| Latency | Not yet benchmarked on devices. One forward pass is a 4096×23 matrix multiply, so it is expected to take well under 10 ms. |
| Training data | `ai/datasets/intents_seed.json`: about 330 utterances written by the developers, plus augmented prefixes |
| Licence | Project-owned |

## Why not multilingual MiniLM by default?
We checked `Xenova/paraphrase-multilingual-MiniLM-L12-v2` and `Xenova/multilingual-e5-small`. Their int8 ONNX files are **118 MB**, about 12× the 10 MB budget. Most of that size is the 250k-token embedding table. Their pre-training corpora also include little or no Nigerian Pidgin, Yoruba, Hausa or Igbo. MiniLM is still available as an optional, experimental download (pack `intent-minilm`). Pruning its vocabulary to the tokens that actually occur in Nigerian-language text could bring it near 25–30 MB. This is a planned experiment.

## Evaluation (smoke test only)
Held-out split: 20% of the seed utterances per (intent, language) group, where a group has at least 4 examples. There are 38 test utterances in total. Source: `ai/evaluation/intent_report.json`.

| Language | n | Intent acc. | Language-ID acc. |
|---|---|---|---|
| English | 20 | 0.70 | 0.75 |
| Pidgin | 6 | 1.00 | 0.67 |
| Yoruba | 4 | 0.50 | 1.00 |
| Hausa | 4 | 0.25 | 1.00 |
| Igbo | 4 | 1.00 | 1.00 |

Most errors happen at confidence below the 0.45 threshold. In those cases the router **asks for clarification** instead of acting. **These numbers come from tiny, developer-written data. They are not evidence of real-world support for any language.**

## Known limitations
- The Yoruba, Hausa, Igbo and Pidgin examples were not written by native speakers.
- Tone marks are stripped and Hausa hooked letters are folded (ɗ→d, ƙ→k, ɓ→b). This helps when ASR or keyboard output lacks diacritics, but it merges some minimal pairs.
- The classifier has no context. "Stop" may be read as `cancel` or as `stop_speaking`.

## Path to production
1. Collect real commands from native speakers in each language, including transcripts from the chosen ASR model.
2. Retrain. Report per-language precision and recall on a test set built from different speakers.
3. Calibrate the confidence thresholds per language.
4. Benchmark on a 2 GB RAM Android phone: cold-load time, inference latency and peak memory.
