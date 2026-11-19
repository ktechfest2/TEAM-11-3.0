/**
 * Spoken-language detection: which language is this person speaking?
 *
 * Whisper alone cannot tell Yoruba, Hausa or Igbo apart (it hears them as French, Maori,
 * Chinese...), so AwaVote adds a tiny classifier (public/models/nano/lid-v1.json, ~10 KB) on top
 * of the Whisper-tiny model that already ships with the app. It reads Whisper's own language
 * scores and/or the encoder's "voice fingerprint" and outputs: en (English or Pidgin — one
 * speech model serves both), yo, ha or ig. Trained on FLEURS read speech (CC-BY 4.0); see
 * ai/language_id/README.md. Runs on the phone, offline, in ~0.2–1 s.
 */
import { loadFrom } from "./transformers";

const TINY = "onnx-community/whisper-tiny";
let ready = null;

async function load() {
  const head = await fetch("/models/nano/lid-v1.json").then((r) => { if (!r.ok) throw new Error("language detector missing"); return r.json(); });
  const { tf, processor, model } = await loadFrom("bundled", async (tf) => ({
    tf,
    processor: await tf.AutoProcessor.from_pretrained(TINY),
    model: await tf.WhisperForConditionalGeneration.from_pretrained(TINY, { dtype: "q8", device: "wasm" }),
  }));
  const langIds = head.lang_ids; // Whisper's fixed language-token ids (50259..50357)
  const sot = head.sot;          // <|startoftranscript|>
  return { tf, head, processor, model, langIds, sot };
}

export function warmupLid() {
  ready ??= load().catch((e) => { ready = null; throw e; });
  return ready;
}

/**
 * @param {Float32Array} pcm 16 kHz mono
 * @returns {Promise<{lang: "en"|"yo"|"ha"|"ig", p: number, probs: Record<string, number>, latencyMs: number}>}
 */
export async function detectSpokenLanguage(pcm) {
  const t0 = performance.now();
  const { tf, head, processor, model, langIds, sot } = await warmupLid();
  const { input_features } = await processor(pcm);
  // One encoder pass, reused for both the fingerprint and Whisper's language scores.
  const encOut = await model.sessions.model.run({ input_features: input_features.ort_tensor ?? input_features });
  const enc = encOut.last_hidden_state;
  const [, frames, dim] = enc.dims;
  const feats = [];
  if (head.features !== "pooled") {
    const out = await model.forward({
      encoder_outputs: new tf.Tensor(enc.type, enc.data, enc.dims),
      decoder_input_ids: new tf.Tensor("int64", BigInt64Array.from([BigInt(sot)]), [1, 1]),
    });
    const logits = out.logits.data; // (1, 1, vocab)
    const vocab = out.logits.dims.at(-1);
    const off = logits.length - vocab;
    const sel = langIds.map((i) => logits[off + i]);
    const max = Math.max(...sel);
    const lse = max + Math.log(sel.reduce((s, v) => s + Math.exp(v - max), 0));
    feats.push(...sel.map((v) => v - lse)); // log-softmax over language tokens
  }
  if (head.features !== "logits") {
    const n = Math.max(1, Math.min(frames, Math.floor((pcm.length / 16000) * 50))); // only frames with real audio
    const pooled = new Float64Array(dim);
    for (let t = 0; t < n; t++) for (let d = 0; d < dim; d++) pooled[d] += enc.data[t * dim + d];
    for (let d = 0; d < dim; d++) feats.push(pooled[d] / n);
  }
  const k = head.classes.length;
  const zz = Float64Array.from(head.b); // linear classifier: z = ((x - mu) / sd) · W + b
  for (let i = 0; i < feats.length; i++) {
    const x = (feats[i] - head.mu[i]) / head.sd[i];
    const row = head.W[i];
    for (let c = 0; c < k; c++) zz[c] += x * row[c];
  }
  const m = Math.max(...zz);
  const e = Array.from(zz, (v) => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  const probs = Object.fromEntries(head.classes.map((c, i) => [c, e[i] / sum]));
  const best = head.classes.reduce((a, c) => (probs[c] > probs[a] ? c : a));
  return { lang: best, p: probs[best], probs, latencyMs: Math.round(performance.now() - t0) };
}

export async function releaseLid() {
  if (!ready) return;
  const r = await ready.catch(() => null);
  ready = null;
  await r?.model?.dispose?.();
}
