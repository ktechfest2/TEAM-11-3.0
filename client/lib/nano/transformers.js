/** Lazy, locally-configured Transformers.js (which itself runs on ONNX Runtime Web). */
let mod = null;

export async function getTransformers() {
  if (mod) return mod;
  mod = await import("@huggingface/transformers");
  // Models bundled with the app (scripts/fetch-models.mjs) are served from our own origin;
  // Hugging Face is only a fallback if a bundled file is missing.
  mod.env.allowLocalModels = true;
  mod.env.localModelPath = BUNDLED_MODELS;
  mod.env.useBrowserCache = true; // packs persist in Cache Storage => usable offline after download
  mod.env.backends.onnx.wasm.numThreads = 1;
  mod.env.backends.onnx.wasm.wasmPaths = "/ort-tf/";
  return mod;
}

export const TRANSFORMERS_CACHE = "transformers-cache";
export const BUNDLED_MODELS = "/models/hf/";
