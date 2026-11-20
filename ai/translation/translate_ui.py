"""Translate AwaVote's interface text with translation models; writes client/lib/i18n/machine.js.

- Yoruba, Hausa, Igbo: Meta NLLB-200 distilled 600M (CTranslate2 int8 build), CC-BY-NC 4.0.
- Nigerian Pidgin: NITHUB-AI/marian-mt-bbc-en-pcm (Marian), CC-BY 4.0.

Keys that already have a hand-set string in messages.js are left alone. Placeholders ({n}, {lang} …)
and names (AwaVote, INEC, IReV, EC8A, BVAS, PVC, N-ATLaS …) are protected during translation and
restored; a translation that loses one, comes back empty or balloons is dropped (English is used).

    ai/.venv/bin/python ai/translation/translate_ui.py [--langs yo ha ig pcm]
    (AWAVOTE_MT_NLLB / AWAVOTE_MT_PCM = local model folders, instead of downloading from Hugging Face)
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MESSAGES = ROOT / "client/lib/i18n/messages.js"
OUT = ROOT / "client/lib/i18n/machine.js"
REJECTED = Path(__file__).with_name("rejected.json")  # translations checked and rejected: English is kept
NLLB = {"yo": "yor_Latn", "ha": "hau_Latn", "ig": "ibo_Latn"}
KEEP = ["English", "AwaVote", "N-ATLaS", "Awarri", "INEC", "IReV", "EC8A", "EC8B", "EC8E", "BVAS", "PVC", "CSV", "OCR", "SMS", "Wi-Fi",
        "WhatsApp", "Whisper", "Hausa", "Yorùbá", "Yoruba", "Igbo", "Pidgin", "Naijá", "APC", "PDP", "LP", "NNPP", "MB", "GB"]


def parse_blocks(src: str) -> dict[str, dict[str, str]]:
    blocks = {}
    for m in re.finditer(r"^const (\w+) = \{\n(.*?)^\};", src, re.S | re.M):
        pairs = re.findall(r'^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$', m.group(2), re.M)
        blocks[m.group(1)] = {k: json.loads(f'"{v}"') for k, v in pairs}
    return blocks


NUM_SLOTS = ["17", "23", "29", "31", "37", "41"]
WORD_SLOTS = ["Kano", "Ilorin", "Owerri", "Yola", "Jos", "Ondo"]
NUMERIC_PLACEHOLDERS = {"n", "pct", "count", "size", "secs", "total", "speakers", "commands", "prompts", "attempts", "ms", "days"}


def protect(text: str):
    """Swap {placeholders} for realistic stand-ins that translation models keep (a number or a town
    name), remembering which is which. Returns (text, slots, names_that_must_survive)."""
    slots, nums, words = [], iter(NUM_SLOTS), iter(WORD_SLOTS)
    def sub(m):
        stand_in = next(nums) if m.group(1) in NUMERIC_PLACEHOLDERS else next(words)
        slots.append((stand_in, m.group(0)))
        return stand_in
    guarded = re.sub(r"\{(\w+)\}", sub, text)
    must = [k for k in KEEP if k in text] + re.findall(r"https?://\S+", text)
    return guarded, slots, must


def restore(text: str, slots: list, must: list) -> str | None:
    for stand_in, original in slots:
        if len(re.findall(rf"\b{re.escape(stand_in)}\b", text)) != 1:
            return None
        text = re.sub(rf"\b{re.escape(stand_in)}\b", lambda _m: original, text)
    if any(m not in text for m in must):
        return None
    return text


def worth_translating(text: str) -> bool:
    letters = re.sub(r"\{\w+\}|[^A-Za-z]", "", text)
    return len(letters) >= 2 and not re.fullmatch(r"[A-Z0-9+\-–—·/ .]+", text)


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\[])", text) if s] if len(text) > 160 else [text]


def make_nllb():
    import ctranslate2
    import sentencepiece as spm
    from huggingface_hub import snapshot_download
    d = os.environ.get("AWAVOTE_MT_NLLB") or snapshot_download("JustFrederik/nllb-200-distilled-600M-ct2-int8")
    tr = ctranslate2.Translator(d, device="cpu", compute_type="int8", inter_threads=1, intra_threads=4)
    sp = spm.SentencePieceProcessor(model_file=str(Path(d) / "sentencepiece.bpe.model"))

    def translate(texts: list[str], lang: str) -> list[str]:
        src = [["eng_Latn"] + sp.encode(t, out_type=str) + ["</s>"] for t in texts]
        res = tr.translate_batch(src, target_prefix=[[NLLB[lang]]] * len(src), beam_size=4, max_decoding_length=300,
                                 repetition_penalty=1.1)
        return [sp.decode([t for t in r.hypotheses[0] if t != NLLB[lang]]) for r in res]

    def back(text: str, lang: str) -> str:
        src = [[NLLB[lang]] + sp.encode(text, out_type=str) + ["</s>"]]
        r = tr.translate_batch(src, target_prefix=[["eng_Latn"]], beam_size=2, max_decoding_length=300)[0]
        return sp.decode([t for t in r.hypotheses[0] if t != "eng_Latn"])
    translate.back = back
    return translate


def make_pidgin():
    import torch
    from transformers import MarianMTModel, MarianTokenizer
    name = os.environ.get("AWAVOTE_MT_PCM") or "NITHUB-AI/marian-mt-bbc-en-pcm"
    tok, model = MarianTokenizer.from_pretrained(name), MarianMTModel.from_pretrained(name).eval()

    def translate(texts: list[str], _lang: str) -> list[str]:
        with torch.no_grad():
            enc = tok(texts, return_tensors="pt", padding=True, truncation=True, max_length=256)
            out = model.generate(**enc, num_beams=4, max_length=300, repetition_penalty=1.1)
        return tok.batch_decode(out, skip_special_tokens=True)
    return translate


MIN_WORDS = {"pcm": 4}  # Pidgin: short labels stay English (the MT model garbles 1–3-word fragments)
# Pidgin keeps these election terms as in English: their counts must not change (catches "Votes" -> "Voters").
TERMS = ["vote", "votes", "voter", "voters", "ballot", "ballots", "accredited", "registered", "rejected", "spoiled",
         "valid", "result", "results", "polling unit", "candidate", "candidates", "party", "parties"]


def chrf(a: str, b: str, n: int = 3) -> float:
    """Character n-gram F-score: a cheap, language-agnostic similarity for back-translation checks."""
    grams = lambda t: [t[i:i + n] for i in range(len(t) - n + 1)]  # noqa: E731
    x, y = grams(re.sub(r"\s+", " ", a.lower())), grams(re.sub(r"\s+", " ", b.lower()))
    if not x or not y:
        return 0.0
    from collections import Counter
    cx, cy = Counter(x), Counter(y)
    overlap = sum((cx & cy).values())
    p, r = overlap / len(y), overlap / len(x)
    return 0.0 if not overlap else 2 * p * r / (p + r)


def quality_ok(src: str, out: str, lang: str, back=None) -> bool:
    words = lambda t: re.findall(r"[^\W\d_]+", t)  # noqa: E731
    if len(words(out)) < (0.8 if lang == "pcm" else 0.6) * len(words(src)):
        return False  # truncated
    if lang == "pcm":
        for term in TERMS:
            pat = rf"\b{term}\b"
            if len(re.findall(pat, src, re.I)) != len(re.findall(pat, out, re.I)):
                return False
    if back is not None:
        # Short phrases are where models fail most; longer sentences carry enough context.
        return chrf(src, back(out, lang)) >= (BACK_MIN_LONG if len(words(src)) >= 5 else BACK_MIN)
    return True


BACK_MIN = 0.45
BACK_MIN_LONG = 0.38


def translate_key(text: str, lang: str, engine) -> str | None:
    if len(re.findall(r"[A-Za-z]+", text)) < MIN_WORDS.get(lang, 1):
        return None
    parts = []
    for sent in sentences(text):
        if not worth_translating(sent):
            parts.append(sent)
            continue
        guarded, slots, must = protect(sent)
        out = engine([guarded], lang)[0].strip()
        if "⁇" in out:  # NLLB's unknown-token mark: it appears where the English had a dash
            out = re.sub(r"\s*⁇\s*", " — ", out) if out.count("⁇") == sent.count("—") else ""
        out = restore(out, slots, must) if out else None
        if not out or len(out) > 3 * len(sent) + 20:
            return None
        if not re.search(r'^["“]', sent):
            out = re.sub(r'^["“”]+|["“”]+$', "", out).strip()
        if sent[:1].isupper() and out[:1].islower():
            out = out[0].upper() + out[1:]
        if not quality_ok(sent, out, lang, getattr(engine, "back", None)):
            return None
        parts.append(out)
    result = " ".join(parts)
    return None if result == text else result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", nargs="+", default=["yo", "ha", "ig", "pcm"])
    a = ap.parse_args()
    blocks = parse_blocks(MESSAGES.read_text())
    en = blocks["en"]
    existing = json.loads(re.search(r"MACHINE = (\{.*\});", OUT.read_text(), re.S).group(1)) if OUT.exists() else {}
    machine = {k: dict(existing.get(k, {})) for k in ["pcm", "yo", "ha", "ig"]}
    engines = {}
    for lang in a.langs:
        engine = engines.setdefault("pidgin" if lang == "pcm" else "nllb", make_pidgin() if lang == "pcm" else make_nllb())
        rejected = set(json.loads(REJECTED.read_text()).get(lang, [])) if REJECTED.exists() else set()
        machine[lang] = {k: v for k, v in machine[lang].items() if k not in rejected}
        todo = [k for k in en if k not in blocks.get(lang, {}) and k not in machine[lang] and k not in rejected]
        kept = dropped = 0
        for i, k in enumerate(todo):
            out = translate_key(en[k], lang, engine)
            if out:
                machine[lang][k] = out; kept += 1
            else:
                dropped += 1
            if i % 40 == 0:
                print(f"[{lang}] {i + 1}/{len(todo)}  {en[k][:50]!r} -> {(out or '—')[:60]!r}", flush=True)
        # keys removed from English are removed here too
        machine[lang] = {k: v for k, v in machine[lang].items() if k in en}
        print(f"[{lang}] translated {kept}, kept English for {dropped}", flush=True)
        write(machine)


def write(machine):
    body = json.dumps(machine, ensure_ascii=False, indent=1, sort_keys=True)
    OUT.write_text('''/**
 * Interface text translated by translation models (generated by ai/translation/translate_ui.py —
 * do not edit by hand): Yoruba, Hausa and Igbo with Meta NLLB-200; Nigerian Pidgin with
 * NITHUB-AI English→Pidgin MT. Used for any key without a hand-set string in messages.js.
 */
export const MACHINE = ''' + body + ";\n")


if __name__ == "__main__":
    sys.exit(main())
