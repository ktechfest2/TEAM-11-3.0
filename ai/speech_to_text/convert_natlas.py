"""Convert N-ATLaS speech-recognition models to int8 ONNX for on-device use in AwaVote.

N-ATLaS (Awarri Technologies / Federal Government of Nigeria) publishes four Whisper-small
fine-tunes: NCAIR1/Yoruba-ASR, NCAIR1/Hausa-ASR, NCAIR1/Igbo-ASR, NCAIR1/NigerianAccentedEnglish.
They are gated: the account whose token you use must have accepted Awarri's terms on
Hugging Face.

    export HF_TOKEN=hf_xxx               # or: ai/.venv/bin/hf auth login
    ai/.venv/bin/python ai/speech_to_text/convert_natlas.py            # all four
    ai/.venv/bin/python ai/speech_to_text/convert_natlas.py --langs yo # one language

Output (served by the AwaVote server at /models/<id>/, cached on phones, then offline):
    server/data/models/<id>/{config,tokenizer,...}.json
    server/data/models/<id>/onnx/{encoder_model,decoder_model_merged}_quantized.onnx
    server/data/models/<id>/NOTICE.txt
    server/data/models/registry.json

LICENCE (N-ATLaS "Open-Source Research and Innovation License"): non-commercial research /
innovation use; at most 1,000 active end-users per rolling 30 days without a commercial
licence from Awarri; derivatives under the same terms, renamed with the suffix
"Powered by Awarri"; attribution required. Check compliance before any public launch.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "server" / "data" / "models"

NATLAS = {
    "yo": {"repo": "NCAIR1/Yoruba-ASR", "name": "Yoruba", "whisper_lang": "yoruba"},
    "ha": {"repo": "NCAIR1/Hausa-ASR", "name": "Hausa", "whisper_lang": "hausa"},
    "ig": {"repo": "NCAIR1/Igbo-ASR", "name": "Igbo", "whisper_lang": None},  # Whisper has no Igbo token
    "en": {"repo": "NCAIR1/NigerianAccentedEnglish", "name": "Nigerian English", "whisper_lang": "english"},
}
# Pidgin has no N-ATLaS model; it is served by the Nigerian-English model (closest match).
ALSO_SERVES = {"en": ["pcm"]}
COPY = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json",
        "vocab.json", "merges.txt", "normalizer.json", "added_tokens.json", "special_tokens_map.json"]
ATTRIBUTION = "{name}-ASR is developed by Awarri Technologies in partnership with the Federal Government of Nigeria."


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def language_token(model_dir: Path, whisper_lang: str | None):
    """Whisper language name to force during decoding, if the model's vocabulary has it."""
    if not whisper_lang:
        return None
    gen = json.loads((model_dir / "generation_config.json").read_text()) if (model_dir / "generation_config.json").exists() else {}
    lang_to_id = gen.get("lang_to_id") or {}
    codes = {"yoruba": "yo", "hausa": "ha", "english": "en"}
    return whisper_lang if f"<|{codes[whisper_lang]}|>" in lang_to_id or not lang_to_id else None


def _python314_optimum_fix():
    """Python 3.14 made functools.partial a method descriptor, so Optimum's
    `NORMALIZED_CONFIG_CLASS = SomeConfig.with_args(...)` class attributes now receive `self`
    as an extra argument ("got multiple values for argument 'allow_new'"). Wrapping them in
    staticmethod restores the pre-3.14 behaviour. Harmless on older Pythons."""
    import functools
    import inspect

    from optimum.exporters.onnx import model_configs
    for _, cls in inspect.getmembers(model_configs, inspect.isclass):
        v = cls.__dict__.get("NORMALIZED_CONFIG_CLASS")
        if isinstance(v, functools.partial):
            setattr(cls, "NORMALIZED_CONFIG_CLASS", staticmethod(v))


def _step(*args):
    """Run one conversion phase in a fresh interpreter (see _phase)."""
    import subprocess
    r = subprocess.run([sys.executable, "-I", __file__, "--phase", *args])
    if r.returncode:
        sys.exit(f"phase {args[0]} failed (exit {r.returncode}; -9 usually means out of memory)")


def _phase(name: str, *args: str):
    if name == "export":
        import torch
        from optimum.exporters.onnx import main_export
        torch.set_num_threads(2)
        if sys.version_info >= (3, 14):
            _python314_optimum_fix()
        # no_post_process: skip Optimum's in-process decoder merge (the memory peak); merged later.
        main_export(args[0], output=args[1], task="automatic-speech-recognition-with-past", device="cpu", no_post_process=True)
    elif name == "quantize":
        from onnxruntime.quantization import QuantType, quantize_dynamic
        quantize_dynamic(args[0], args[1], weight_type=QuantType.QUInt8, extra_options={"EnableSubgraph": True})
    elif name == "merge":
        from optimum.onnx import merge_decoders
        merge_decoders(args[0], args[1], strict=False, save_path=args[2])
    else:
        sys.exit(f"unknown phase {name}")


def convert(code: str, source: str, model_id: str, name: str, whisper_lang: str | None, natlas: bool):
    from huggingface_hub import snapshot_download
    import onnxruntime as ort

    token = os.environ.get("HF_TOKEN") or None
    print(f"[{code}] downloading {source} …", flush=True)
    from huggingface_hub import HfApi
    repo_files = HfApi().list_repo_files(source, token=token)
    # Weights in ONE format only (safetensors preferred); skips optimizer/trainer state (~2 GB in N-ATLaS repos).
    weights = ["model.safetensors"] if "model.safetensors" in repo_files else ["pytorch_model.bin"]
    src = Path(snapshot_download(source, token=token, allow_patterns=["*.json", "*.txt", *weights]))
    dest = OUT / model_id
    if dest.exists():
        shutil.rmtree(dest)
    (dest / "onnx").mkdir(parents=True)
    # Each heavy step runs in its own Python process so its memory is returned to the OS before
    # the next one starts (a single process peaked at ~5 GB and was OOM-killed on a 14 GB laptop).
    # Decoders are quantised BEFORE merging: merging two int8 graphs needs a fraction of the memory.
    # On disk next to the output, not /tmp (often RAM-backed tmpfs; the fp32 graphs are ~2 GB).
    with tempfile.TemporaryDirectory(dir=OUT.parent, prefix=".convert-") as tmp:
        t = Path(tmp)
        print(f"[{code}] exporting to ONNX …", flush=True)
        _step("export", str(src), tmp)
        for part in ("encoder_model", "decoder_model", "decoder_with_past_model"):
            if not (t / f"{part}.onnx").exists():
                sys.exit(f"export did not produce {part}.onnx; got {sorted(os.listdir(tmp))}")
        print(f"[{code}] quantising to int8 …", flush=True)
        _step("quantize", str(t / "encoder_model.onnx"), str(dest / "onnx" / "encoder_model_quantized.onnx"))
        _step("quantize", str(t / "decoder_model.onnx"), str(t / "decoder_q.onnx"))
        _step("quantize", str(t / "decoder_with_past_model.onnx"), str(t / "decoder_with_past_q.onnx"))
        print(f"[{code}] merging decoders …", flush=True)
        _step("merge", str(t / "decoder_q.onnx"), str(t / "decoder_with_past_q.onnx"), str(dest / "onnx" / "decoder_model_merged_quantized.onnx"))
    for f in COPY:
        if (src / f).exists():
            shutil.copy2(src / f, dest / f)
    # Sanity check: both graphs must load in ONNX Runtime.
    for part in ("encoder_model", "decoder_model_merged"):
        ort.InferenceSession(str(dest / "onnx" / f"{part}_quantized.onnx"), providers=["CPUExecutionProvider"])
    display = f"AwaVote {name} ASR (int8){' Powered by Awarri' if natlas else ''}"
    attribution = ATTRIBUTION.format(name=name if code != "en" else "NigerianAccentedEnglish") if natlas else ""
    (dest / "NOTICE.txt").write_text(
        f"{display}\nConverted from {source} to int8 ONNX for on-device use in AwaVote.\n"
        + (f"\n{attribution}\nLicensed under the N-ATLaS Open-Source Research and Innovation License; "
           "see https://huggingface.co/" + source + "\n" if natlas else ""))
    files = {str(p.relative_to(dest)): {"bytes": p.stat().st_size, "sha256": sha256(p)} for p in sorted(dest.rglob("*")) if p.is_file()}
    entry = {
        "id": model_id, "name": display, "languages": [code] + ALSO_SERVES.get(code, []) if natlas else [code],
        "source": source, "base": "openai/whisper-small" if natlas else source,
        "language_token": language_token(dest, whisper_lang),
        "size_bytes": sum(f["bytes"] for f in files.values()), "files": files,
        "license": "N-ATLaS Open-Source Research and Innovation License (max 1,000 active users / 30 days without a commercial licence)" if natlas else "see source",
        "attribution": attribution, "converted_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    reg_path = OUT / "registry.json"
    import fcntl
    with open(OUT / ".registry.lock", "w") as lock:  # two conversions finishing together must not clobber each other
        fcntl.flock(lock, fcntl.LOCK_EX)
        reg = json.loads(reg_path.read_text()) if reg_path.exists() else {"models": []}
        reg["models"] = [m for m in reg["models"] if m["id"] != model_id] + [entry]
        tmp_reg = reg_path.with_suffix(".tmp")
        tmp_reg.write_text(json.dumps(reg, indent=1, ensure_ascii=False))
        tmp_reg.replace(reg_path)
    print(f"[{code}] done: {model_id} ({entry['size_bytes'] / 1e6:.0f} MB)", flush=True)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--phase":
        return _phase(*sys.argv[2:])
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", nargs="+", default=list(NATLAS), choices=list(NATLAS))
    ap.add_argument("--source", help="convert a different (public) Whisper checkpoint instead, e.g. for testing")
    ap.add_argument("--id", help="model id to use with --source")
    ap.add_argument("--out", help="output folder (default: server/data/models)")
    a = ap.parse_args()
    global OUT
    if a.out:
        OUT = Path(a.out).resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    if a.source:
        convert(a.langs[0], a.source, a.id or a.source.split("/")[-1].lower(), a.source, NATLAS[a.langs[0]]["whisper_lang"], natlas=False)
        return
    for code in a.langs:
        m = NATLAS[code]
        convert(code, m["repo"], f"natlas-asr-{code}-int8", m["name"], m["whisper_lang"], natlas=True)


if __name__ == "__main__":
    main()
