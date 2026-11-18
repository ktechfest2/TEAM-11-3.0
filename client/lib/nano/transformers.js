/** Lazy, locally-configured Transformers.js (which itself runs on ONNX Runtime Web). */
let mod = null;

export async function getTransformers() {
  if (mod) return mod;
  mod = await import("@huggingface/transformers");
  mod.env.allowLocalModels = false;
  mod.env.useBrowserCache = true; // packs persist in Cache Storage => usable offline after download
  mod.env.backends.onnx.wasm.numThreads = 1;
  mod.env.backends.onnx.wasm.wasmPaths = "/ort-tf/";
  return mod;
}

export const TRANSFORMERS_CACHE = "transformers-cache";
