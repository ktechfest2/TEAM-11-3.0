"""Train AwaVote's spoken-language detector on top of the bundled Whisper-tiny (int8 ONNX).

Features per clip (computed exactly as the browser does: same ONNX files, same 30 s padding):
  A) Whisper's language-token log-probabilities after <|startoftranscript|> (99 values)
  B) mean-pooled encoder output over the voiced frames (384 values)
Classes: en (English + Pidgin; one N-ATLaS model serves both), yo, ha, ig.
Training data: FLEURS dev (CC-BY 4.0) read speech, cropped to 1.5-5 s to look like spoken commands.
Held out: whole FLEURS speakers/sentences (20%), NaijaVox real Nigerian samples, and TTS command clips.
"""
import glob, json, random, sys, wave
import numpy as np, torch
from transformers import WhisperProcessor
from optimum.onnxruntime import ORTModelForSpeechSeq2Seq

WT, DATA, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
random.seed(0); np.random.seed(0)
proc = WhisperProcessor.from_pretrained(WT)
m = ORTModelForSpeechSeq2Seq.from_pretrained(WT, subfolder="onnx", encoder_file_name="encoder_model_quantized.onnx",
    decoder_file_name="decoder_model_merged_quantized.onnx", decoder_with_past_file_name="decoder_model_merged_quantized.onnx", use_merged=True)
tok = proc.tokenizer
# Whisper's 99 language tokens are the fixed ids 50259..50357 in every multilingual checkpoint.
LANG_IDS = list(range(50259, 50358))
LANG_TOKENS = tok.convert_ids_to_tokens(LANG_IDS)
SOT = tok.convert_tokens_to_ids("<|startoftranscript|>")
CLASSES = ["en", "yo", "ha", "ig"]


def load(path):
    """Minimal RIFF reader: PCM int16 or IEEE float32, any rate/channels; tolerates a truncated file."""
    import struct
    raw = open(path, "rb").read()
    pos, fmt, data = 12, None, None
    while pos + 8 <= len(raw):
        cid, size = raw[pos:pos + 4], struct.unpack("<I", raw[pos + 4:pos + 8])[0]
        body = raw[pos + 8:pos + 8 + size]
        if cid == b"fmt ": fmt = struct.unpack("<HHIIHH", body[:16])
        elif cid == b"data": data = body
        pos += 8 + size + (size & 1)
    tag, ch, sr, _, _, bits = fmt
    if tag == 3 or bits == 32 and tag == 0xFFFE:
        a = np.frombuffer(data[: len(data) // 4 * 4], dtype=np.float32)
    else:
        a = np.frombuffer(data[: len(data) // 2 * 2], dtype=np.int16).astype(np.float32) / 32768
    a = a[: len(a) // ch * ch].reshape(-1, ch).mean(1)
    if sr != 16000:
        a = np.interp(np.arange(0, len(a), sr / 16000), np.arange(len(a)), a).astype(np.float32)
    return a


def features(a):
    feats = proc(a, sampling_rate=16000, return_tensors="pt").input_features
    with torch.no_grad():
        eo = m.encoder(input_features=feats, attention_mask=None)
        enc = eo.last_hidden_state  # (1, 1500, 384)
        logits = m(encoder_outputs=eo, decoder_input_ids=torch.tensor([[SOT]])).logits[0, -1]
    lp = torch.log_softmax(logits[LANG_IDS], -1).numpy()
    n = max(1, min(1500, int(len(a) / 16000 * 50)))  # 50 encoder frames per second of real audio
    pooled = enc[0, :n].mean(0).numpy()
    return lp, pooled


def crops(a, k):
    out = []
    for _ in range(k):
        L = int(16000 * random.uniform(1.5, 5.0))
        if len(a) <= L: out.append(a); continue
        s = random.randint(0, len(a) - L); out.append(a[s:s + L])
    return out


# en = the English family: US English (FLEURS) + Nigerian-accented English + Nigerian Pidgin.
SOURCES = [("en", "en_us", 150), ("en", "ng_en", 150), ("en", "pcm", 150), ("yo", "yo_ng", 160), ("ha", "ha_ng", 160), ("ig", "ig_ng", 160)]
X_lp, X_pool, y, split, src = [], [], [], [], []
for c, d, cap in SOURCES:
    files = sorted(glob.glob(f"{DATA}/{d}/**/*.wav", recursive=True))
    if d.endswith("_ng") or d == "en_us": files = files[:-1]  # partial archives: last file may be cut off
    files = files[:cap]
    random.shuffle(files)
    for i, f in enumerate(files):
        held = i < len(files) // 5
        for seg in crops(load(f), 1 if held else 2):
            lp, pool = features(seg); X_lp.append(lp); X_pool.append(pool); y.append(CLASSES.index(c)); split.append("test" if held else "train"); src.append(d)
    print(c, d, len(files), "files", flush=True)
src = np.array(src)
X_lp, X_pool, y, split = map(np.array, (X_lp, X_pool, y, split))


def fit(X, Y, l2=1e-2, epochs=400):
    mu, sd = X.mean(0), X.std(0) + 1e-6
    Xn = torch.tensor((X - mu) / sd, dtype=torch.float32); Yt = torch.tensor(Y)
    cw = torch.tensor(len(Y) / (len(CLASSES) * np.bincount(Y, minlength=len(CLASSES))), dtype=torch.float32)
    W = torch.zeros(X.shape[1], len(CLASSES), requires_grad=True); b = torch.zeros(len(CLASSES), requires_grad=True)
    opt = torch.optim.LBFGS([W, b], max_iter=epochs)
    def closure():
        opt.zero_grad(); loss = torch.nn.functional.cross_entropy(Xn @ W + b, Yt, weight=cw) + l2 * (W ** 2).sum(); loss.backward(); return loss
    opt.step(closure)
    return {"mu": mu, "sd": sd, "W": W.detach().numpy(), "b": b.detach().numpy()}


def predict(model, X):
    z = ((X - model["mu"]) / model["sd"]) @ model["W"] + model["b"]
    p = np.exp(z - z.max(1, keepdims=True)); return p / p.sum(1, keepdims=True)


tr, te = split == "train", split == "test"
variants = {"logits": X_lp, "pooled": X_pool, "both": np.hstack([X_lp, X_pool])}
extra_files = sorted(glob.glob(f"{DATA}/naijavox/*.wav")) + sorted(glob.glob(sys.argv[4] + "/*.wav")) if len(sys.argv) > 4 else []
name_cls = lambda n: next((c for k, c in [("english", "en"), ("pidgin", "en"), ("en_", "en"), ("pcm_", "en"), ("yoruba", "yo"), ("yo_", "yo"), ("hausa", "ha"), ("ha_", "ha"), ("igbo", "ig"), ("ig_", "ig")] if k in n), None)
extra = [(f, name_cls(f.rsplit("/", 1)[1])) for f in extra_files]
extra_feats = [features(load(f)) for f, _ in extra]
best = None
for name, X in variants.items():
    model = fit(X[tr], y[tr])
    acc = (predict(model, X[te]).argmax(1) == y[te]).mean()
    ex = [np.concatenate([lp, pool]) if name == "both" else (lp if name == "logits" else pool) for lp, pool in extra_feats]
    pe = predict(model, np.array(ex)) if ex else np.zeros((0, 4))
    ex_acc = np.mean([CLASSES[p.argmax()] == c for p, (_, c) in zip(pe, extra)]) if ex else float("nan")
    print(f"\n== {name}: held-out FLEURS acc {acc:.3f} | real/extra clips acc {ex_acc:.3f}")
    conf = np.zeros((4, 4), int)
    for a_, b_ in zip(y[te], predict(model, X[te]).argmax(1)): conf[a_, b_] += 1
    print("confusion (rows=true en,yo,ha,ig):\n", conf)
    pt = predict(model, X[te]).argmax(1)
    print("   per source:", {d: round(float((pt[src[te] == d] == y[te][src[te] == d]).mean()), 3) for d in np.unique(src[te])})
    for (f, c), p in zip(extra, pe):
        print(f"   {f.rsplit('/',1)[1]:24} true={c} pred={CLASSES[p.argmax()]} p={p.max():.2f}")
    score = acc + (0 if np.isnan(ex_acc) else ex_acc)
    if best is None or score > best[0]: best = (score, name, model)

score, name, model = best
print(f"\nBEST: {name}")
json.dump({"version": 1, "features": name, "classes": CLASSES, "lang_tokens": LANG_TOKENS, "lang_ids": LANG_IDS, "sot": SOT,
           "mu": model["mu"].round(5).tolist(), "sd": model["sd"].round(5).tolist(),
           "W": model["W"].round(5).tolist(), "b": model["b"].round(5).tolist(),
           "trained_on": "FLEURS dev (CC-BY 4.0): en_us, yo_ng, ha_ng, ig_ng; 1.5-5 s crops",
           "base": "onnx-community/whisper-tiny (int8)"}, open(OUT, "w"))
print("wrote", OUT)
