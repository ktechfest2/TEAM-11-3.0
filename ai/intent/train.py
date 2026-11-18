"""Train the AwaVote Nano intent + language-ID classifier and export it to ONNX.

    ai/.venv/bin/python ai/intent/train.py

Model: two linear softmax heads over the same hashed n-gram features
(features[N,4096] -> intent_probs[N,K], lang_probs[N,5]). Weights are float16-stored
INT8-friendly sized (~4096*(K+5) params) so the model is well under the 10 MB target.

Outputs:
  client/public/models/nano/intent-v1.onnx
  client/public/models/nano/intent-v1.json         (labels, thresholds, featuriser config)
  client/lib/nano/intent/parity_vectors.json       (featuriser parity tests)
  ai/evaluation/intent_report.json                 (per-language held-out accuracy)
"""
import json
import random
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

sys.path.insert(0, str(Path(__file__).parent))
from featurizer import DIM, featurize, normalize  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "ai/datasets/intents_seed.json"
OUT_DIR = ROOT / "client/public/models/nano"
LANGS = ["en", "pcm", "yo", "ha", "ig"]  # extended automatically with contributed languages (see load())
SEED = 7


CONTRIB = ROOT / "ai/datasets/contributed_utterances.json"


def load():
    d = json.loads(DATA.read_text())
    # Merge approved native-speaker transcripts (exported by server/scripts/export_contributions.py).
    if CONTRIB.exists():
        for intent, by_lang in json.loads(CONTRIB.read_text())["intents"].items():
            for lang, exs in by_lang.items():
                d["intents"].setdefault(intent, {}).setdefault(lang, []).extend(exs)
    rows = []
    for intent, by_lang in d["intents"].items():
        for lang, exs in by_lang.items():
            for e in exs:
                rows.append((e, intent, lang))
    return d, rows


def augment(rows, prefixes):
    out = list(rows)
    for text, intent, lang in rows:
        if intent.startswith("action.confirm") or intent.startswith("action.cancel"):
            continue  # "please yes" is not natural; keep yes/no short
        for p in prefixes.get(lang, []):
            out.append((f"{p} {text}", intent, lang))
    return out


def to_matrix(texts):
    X = np.zeros((len(texts), DIM), dtype=np.float32)
    for r, t in enumerate(texts):
        for i, v in featurize(t).items():
            X[r, i] = v
    return X


def train_softmax(X, y, k, epochs=800, lr=8.0, l2=1e-4):
    rng = np.random.default_rng(SEED)
    W = rng.normal(0, 0.01, (X.shape[1], k)).astype(np.float32)
    b = np.zeros(k, dtype=np.float32)
    Y = np.eye(k, dtype=np.float32)[y]
    for _ in range(epochs):
        z = X @ W + b
        z -= z.max(1, keepdims=True)
        p = np.exp(z)
        p /= p.sum(1, keepdims=True)
        g = (p - Y) / len(X)
        W -= lr * (X.T @ g + l2 * W)
        b -= lr * g.sum(0)
    return W, b


def predict(X, W, b):
    z = X @ W + b
    z -= z.max(1, keepdims=True)
    p = np.exp(z)
    return p / p.sum(1, keepdims=True)


def split(rows):
    """Hold out ~20% of ORIGINAL utterances per (intent, lang) where there are >=4 examples."""
    rnd = random.Random(SEED)
    groups = {}
    for r in rows:
        groups.setdefault((r[1], r[2]), []).append(r)
    train, test = [], []
    for g in groups.values():
        g = g[:]
        rnd.shuffle(g)
        n_test = len(g) // 5 if len(g) >= 4 else 0
        test += g[:n_test]
        train += g[n_test:]
    return train, test


def fit(rows, intents):
    X = to_matrix([r[0] for r in rows])
    yi = np.array([intents.index(r[1]) for r in rows])
    for r in rows:
        if r[2] not in LANGS:
            LANGS.append(r[2])
    yl = np.array([LANGS.index(r[2]) for r in rows])
    Wi, bi = train_softmax(X, yi, len(intents))
    Wl, bl = train_softmax(X, yl, len(LANGS))
    return Wi, bi, Wl, bl


def evaluate(test, intents, Wi, bi, Wl, bl):
    X = to_matrix([r[0] for r in test])
    pi, pl = predict(X, Wi, bi), predict(X, Wl, bl)
    report = {}
    for lang in LANGS:
        idx = [n for n, r in enumerate(test) if r[2] == lang]
        if not idx:
            continue
        ok_i = sum(intents[pi[n].argmax()] == test[n][1] for n in idx)
        ok_l = sum(LANGS[pl[n].argmax()] == lang for n in idx)
        report[lang] = {"n": len(idx), "intent_accuracy": round(ok_i / len(idx), 3),
                        "language_id_accuracy": round(ok_l / len(idx), 3)}
    errors = [{"text": test[n][0], "lang": test[n][2], "gold": test[n][1], "pred": intents[pi[n].argmax()],
               "conf": round(float(pi[n].max()), 3)} for n in range(len(test)) if intents[pi[n].argmax()] != test[n][1]]
    return report, errors


def export_onnx(intents, Wi, bi, Wl, bl, path):
    inp = helper.make_tensor_value_info("features", TensorProto.FLOAT, ["N", DIM])
    out_i = helper.make_tensor_value_info("intent_probs", TensorProto.FLOAT, ["N", len(intents)])
    out_l = helper.make_tensor_value_info("lang_probs", TensorProto.FLOAT, ["N", len(LANGS)])
    inits = [numpy_helper.from_array(a.astype(np.float32), n) for a, n in
             ((Wi, "Wi"), (bi, "bi"), (Wl, "Wl"), (bl, "bl"))]
    nodes = [
        helper.make_node("MatMul", ["features", "Wi"], ["zi0"]),
        helper.make_node("Add", ["zi0", "bi"], ["zi"]),
        helper.make_node("Softmax", ["zi"], ["intent_probs"], axis=1),
        helper.make_node("MatMul", ["features", "Wl"], ["zl0"]),
        helper.make_node("Add", ["zl0", "bl"], ["zl"]),
        helper.make_node("Softmax", ["zl"], ["lang_probs"], axis=1),
    ]
    graph = helper.make_graph(nodes, "awavote_nano_intent", [inp], [out_i, out_l], inits)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], producer_name="awavote-nano")
    model.ir_version = 8  # broadly supported by onnxruntime-web
    onnx.checker.check_model(model)
    onnx.save(model, path)


def main():
    d, rows = load()
    intents = sorted(d["intents"].keys())
    train, test = split(rows)
    Wi, bi, Wl, bl = fit(augment(train, d["augment_prefixes"]), intents)
    report, errors = evaluate(test, intents, Wi, bi, Wl, bl)

    # Final model is trained on everything.
    Wi, bi, Wl, bl = fit(augment(rows, d["augment_prefixes"]), intents)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = OUT_DIR / "intent-v1.onnx"
    export_onnx(intents, Wi, bi, Wl, bl, onnx_path)

    meta = {
        "name": "awavote-nano-intent", "version": "1.0.0-seed", "dataset_version": d["version"],
        "dim": DIM, "char_n": [2, 3, 4], "intents": intents, "languages": LANGS,
        "thresholds": {"min_confidence": 0.45, "min_margin": 0.12},
        "size_bytes": onnx_path.stat().st_size,
        "status": "seed model — trained on unvalidated developer-written examples",
    }
    (OUT_DIR / "intent-v1.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    # One example command per intent and language, for the in-app "Things you can say" list.
    skip = {"unknown", "action.confirm", "action.cancel"}
    examples = {lang: [{"intent": i, "text": d["intents"][i][lang][0]} for i in intents
                       if i not in skip and d["intents"][i].get(lang)] for lang in LANGS}
    (OUT_DIR / "examples.json").write_text(json.dumps(examples, indent=1, ensure_ascii=False))

    # Parity vectors for the JS featuriser + a reference ONNX prediction.
    import onnxruntime as ort
    sess = ort.InferenceSession(str(onnx_path))
    samples = ["Scan this result sheet", "Ṣí kámẹ́rà", "ɗauki hoton takardar sakamako", "Abeg, where my polling unit dey?",
               "Gbanwee asụsụ gaa Igbo", "change language to Yorùbá!", "  REPORT   an incident  "]
    vectors = []
    for s in samples:
        f = featurize(s)
        x = np.zeros((1, DIM), dtype=np.float32)
        for i, v in f.items():
            x[0, i] = v
        pi, pl = sess.run(None, {"features": x})
        vectors.append({"text": s, "normalized": normalize(s),
                        "features": {str(k): round(v, 6) for k, v in sorted(f.items())},
                        "top_intent": intents[int(pi[0].argmax())], "top_lang": LANGS[int(pl[0].argmax())]})
    (ROOT / "client/lib/nano/intent").mkdir(parents=True, exist_ok=True)
    (ROOT / "client/lib/nano/intent/parity_vectors.json").write_text(json.dumps(vectors, indent=1, ensure_ascii=False))

    full = {"model": meta, "train_utterances": len(train), "test_utterances": len(test), "per_language": report,
            "errors": errors,
            "caveat": "Held-out split of a tiny developer-written seed set. This is a smoke test, NOT evidence of real-world language support."}
    (ROOT / "ai/evaluation/intent_report.json").write_text(json.dumps(full, indent=2, ensure_ascii=False))
    print(json.dumps({"size_kb": round(meta["size_bytes"] / 1024, 1), "per_language": report, "n_errors": len(errors)}, indent=1))
    for e in errors:
        print("  miss:", e)


if __name__ == "__main__":
    main()
