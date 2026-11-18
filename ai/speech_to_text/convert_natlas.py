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


def convert(code: str, source: str, model_id: str, name: str, whisper_lang: str | None, natlas: bool):
    from huggingface_hub import snapshot_download
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from optimum.exporters.onnx import main_export
    import onnxruntime as ort

    if sys.version_info >= (3, 14):
        _python314_optimum_fix()

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
    with tempfile.TemporaryDirectory() as tmp:
        print(f"[{code}] exporting to ONNX …", flush=True)
        main_export(str(src), output=tmp, task="automatic-speech-recognition-with-past", device="cpu")
        for part in ("encoder_model", "decoder_model_merged"):
            fp = Path(tmp) / f"{part}.onnx"
            if not fp.exists():
                sys.exit(f"export did not produce {fp.name}; got {sorted(os.listdir(tmp))}")
            print(f"[{code}] quantising {part} to int8 …", flush=True)
            # EnableSubgraph: the merged decoder keeps its weights inside If-node sub-graphs, which the
            # quantiser otherwise skips (leaving them fp32 and ~6x larger).
            quantize_dynamic(str(fp), str(dest / "onnx" / f"{part}_quantized.onnx"), weight_type=QuantType.QUInt8,
                             extra_options={"EnableSubgraph": True})
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
    reg = json.loads(reg_path.read_text()) if reg_path.exists() else {"models": []}
    reg["models"] = [m for m in reg["models"] if m["id"] != model_id] + [entry]
    reg_path.write_text(json.dumps(reg, indent=1, ensure_ascii=False))
    print(f"[{code}] done: {model_id} ({entry['size_bytes'] / 1e6:.0f} MB)", flush=True)


def main():
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
