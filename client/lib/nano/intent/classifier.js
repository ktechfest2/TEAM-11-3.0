/**
 * On-device intent + language-ID classifier (ONNX Runtime Web, WASM backend, single thread
 * so it works without cross-origin isolation on low-end phones).
 * Loaded on demand; call release() when voice mode closes to free memory.
 */
import { featurize } from "./featurizer";

const MODEL_URL = "/models/nano/intent-v1.onnx";
const META_URL = "/models/nano/intent-v1.json";

let state = null; // { session, meta, ort }

async function load() {
  if (state) return state;
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.numThreads = 1;
  const [meta, buf] = await Promise.all([
    fetch(META_URL).then((r) => r.json()),
    fetch(MODEL_URL).then((r) => { if (!r.ok) throw new Error("Intent model unavailable"); return r.arrayBuffer(); }),
  ]);
  const session = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
  state = { session, meta, ort };
  return state;
}

function ranked(probs, labels) {
  return Array.from(probs, (p, i) => ({ label: labels[i], p })).sort((a, b) => b.p - a.p);
}

/**
 * @returns {{ intent, confidence, margin, alternatives, language, languageConfidence, confident, latencyMs }}
 */
export async function classify(text) {
  const t0 = performance.now();
  const { session, meta, ort } = await load();
  const x = featurize(text, meta.dim);
  const out = await session.run({ features: new ort.Tensor("float32", x, [1, meta.dim]) });
  const intents = ranked(out.intent_probs.data, meta.intents);
  const langs = ranked(out.lang_probs.data, meta.languages);
  const [top, second] = intents;
  const margin = top.p - (second?.p ?? 0);
  const { min_confidence, min_margin } = meta.thresholds;
  return {
    intent: top.label, confidence: top.p, margin, alternatives: intents.slice(1, 5),
    language: langs[0].label, languageConfidence: langs[0].p,
    confident: top.p >= min_confidence && margin >= min_margin,
    latencyMs: Math.round(performance.now() - t0),
  };
}

export async function warmup() {
  await load();
}

export async function release() {
  if (state) {
    await state.session.release?.();
    state = null;
  }
}

export function isLoaded() {
  return !!state;
}
