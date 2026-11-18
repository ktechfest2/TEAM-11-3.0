"""AwaVote Nano text featuriser. MUST stay bit-identical to client/lib/nano/intent/featurizer.js.

Pipeline: NFD -> lowercase -> drop combining marks (tone marks/dots, so "ṣí"=="si")
-> fold Hausa hooked letters -> map every non letter/digit to a space -> collapse spaces.
Features: hashed (FNV-1a 32-bit over UTF-8) character n-grams (n=2..4) of " text ",
plus word unigrams and bigrams, counted, log1p-scaled and L2-normalised.

Test vectors in client/lib/nano/intent/parity_vectors.json guard against drift.
"""
import math
import unicodedata

DIM = 4096
CHAR_N = (2, 3, 4)


# Hausa hooked letters do not decompose under NFD; ASR output and many keyboards use plain letters.
FOLD = {"ɗ": "d", "ƙ": "k", "ɓ": "b", "ƴ": "y", "ʼ": "'"}


def normalize(text: str) -> str:
    t = unicodedata.normalize("NFD", text).lower()
    out = []
    for ch in t:
        cat = unicodedata.category(ch)
        if cat.startswith("M"):
            continue
        ch = FOLD.get(ch, ch)
        out.append(ch if cat[0] in ("L", "N") else " ")
    return " ".join("".join(out).split())


def fnv1a(s: str) -> int:
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def tokens(text: str) -> list[str]:
    norm = normalize(text)
    feats: list[str] = []
    padded = f" {norm} "
    for n in CHAR_N:
        feats += ["c" + padded[i:i + n] for i in range(len(padded) - n + 1)]
    words = norm.split()
    feats += ["w" + w for w in words]
    feats += ["b" + a + "_" + b for a, b in zip(words, words[1:])]
    return feats


def featurize(text: str, dim: int = DIM) -> dict[int, float]:
    counts: dict[int, float] = {}
    for f in tokens(text):
        i = fnv1a(f) % dim
        counts[i] = counts.get(i, 0.0) + 1.0
    vals = {i: math.log1p(c) for i, c in counts.items()}
    norm = math.sqrt(sum(v * v for v in vals.values())) or 1.0
    return {i: v / norm for i, v in vals.items()}
