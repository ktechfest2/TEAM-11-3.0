"""Make "what the phone will actually hear" variants of the intent seed phrases.

Each seed phrase is spoken by a synthetic voice (Meta MMS-TTS; Yoruba from the voice bundled
with the app) and transcribed by the N-ATLaS model the app uses for that language. The
transcripts — with their real recognition quirks (missing tone marks, merged words, near-misses
like "olùdíje" -> "olórí jẹ") — are saved so train.py can teach the command classifier to
understand recogniser output, not only clean text.

    ai/.venv/bin/python ai/intent/make_asr_variants.py            # all languages
    ai/.venv/bin/python ai/intent/make_asr_variants.py --langs yo

Output: ai/datasets/asr_variants.json  {"<lang>": {"<seed phrase>": "<transcript>"}}
Limits: synthetic voices are cleaner (and for Igbo/Pidgin, worse) than real speakers; this
complements, and does not replace, transcripts of real native speakers.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "ai/datasets/intents_seed.json"
OUT = ROOT / "ai/datasets/asr_variants.json"
MODELS = ROOT / "server/data/models"
VOICES = {"en": "facebook/mms-tts-eng", "pcm": "facebook/mms-tts-eng", "ha": "facebook/mms-tts-hau",
          "ig": "waxal-benchmarking/mms-tts-ibo-rnjema101", "yo": "facebook/mms-tts-yor"}
ASR = {"en": ("natlas-asr-en-int8", "en"), "pcm": ("natlas-asr-en-int8", "en"), "yo": ("natlas-asr-yo-int8", "yo"),
       "ha": ("natlas-asr-ha-int8", "ha"), "ig": ("natlas-asr-ig-int8", None)}


def tts(voice):
    from transformers import AutoTokenizer, VitsModel
    tok, m = AutoTokenizer.from_pretrained(voice), VitsModel.from_pretrained(voice)
    def speak(text):
        with torch.no_grad():
            w = m(**tok(text, return_tensors="pt")).waveform.squeeze().numpy()
        sr = m.config.sampling_rate
        return w if sr == 16000 else np.interp(np.arange(0, len(w), sr / 16000), np.arange(len(w)), w).astype(np.float32)
    return speak


def asr(model_id, lang):
    from optimum.onnxruntime import ORTModelForSpeechSeq2Seq
    from transformers import WhisperProcessor
    d = MODELS / model_id
    proc = WhisperProcessor.from_pretrained(d)
    m = ORTModelForSpeechSeq2Seq.from_pretrained(d, subfolder="onnx", encoder_file_name="encoder_model_quantized.onnx",
        decoder_file_name="decoder_model_merged_quantized.onnx", decoder_with_past_file_name="decoder_model_merged_quantized.onnx", use_merged=True)
    prompt = None
    if lang:
        toks = ["<|startoftranscript|>", f"<|{lang}|>", "<|transcribe|>", "<|notimestamps|>"]
        prompt = torch.tensor([proc.tokenizer.convert_tokens_to_ids(toks)])
        m.generation_config.forced_decoder_ids = None
    def hear(audio):
        feats = proc(audio, sampling_rate=16000, return_tensors="pt").input_features
        ids = m.generate(feats, decoder_input_ids=prompt, max_new_tokens=60) if prompt is not None else m.generate(feats, max_new_tokens=60)
        return proc.batch_decode(ids, skip_special_tokens=True)[0].strip()
    return hear


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", nargs="+", default=list(VOICES))
    a = ap.parse_args()
    seed = json.loads(SEED.read_text())["intents"]
    out = json.loads(OUT.read_text()) if OUT.exists() else {}
    for lang in a.langs:
        phrases = sorted({p for by_lang in seed.values() for p in by_lang.get(lang, [])})
        done = out.setdefault(lang, {})
        todo = [p for p in phrases if p not in done]
        if not todo:
            continue
        speak, hear = tts(VOICES[lang]), asr(*ASR[lang])
        for i, p in enumerate(todo):
            done[p] = hear(speak(p))
            if i % 10 == 0:
                OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
                print(f"[{lang}] {i + 1}/{len(todo)}  {p!r} -> {done[p]!r}", flush=True)
        OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
        print(f"[{lang}] done: {len(done)} phrases", flush=True)


if __name__ == "__main__":
    sys.exit(main())
