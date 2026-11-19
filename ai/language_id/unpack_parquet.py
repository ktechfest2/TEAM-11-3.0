"""Unpack Nigerian-accented English (mp3) and Nigerian Pidgin (wav) parquet audio to 16 kHz WAV clips."""
import io, os, random, sys, wave
import numpy as np, pyarrow.parquet as pq, soundfile as sf

D = sys.argv[1]; random.seed(1)


def save(a, sr, out):
    if a.ndim > 1: a = a.mean(1)
    if sr != 16000: a = np.interp(np.arange(0, len(a), sr / 16000), np.arange(len(a)), a)
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes())


for name, files, cap in [("ng_en", ["ng_en_test.parquet", "ng_en_val.parquet"], 220), ("pcm", ["pcm_val.parquet"], 220)]:
    os.makedirs(f"{D}/{name}", exist_ok=True)
    rows = []
    for f in files:
        rows += [r["bytes"] if isinstance(r, dict) else r for r in pq.read_table(f"{D}/{f}", columns=["audio"]).column("audio").to_pylist()]
    random.shuffle(rows); n = 0
    for b in rows:
        if n >= cap: break
        try:
            a, sr = sf.read(io.BytesIO(b), dtype="float32")
            if len(a) >= sr: save(a, sr, f"{D}/{name}/{n:04d}.wav"); n += 1
        except Exception:
            pass
    print(name, n)
