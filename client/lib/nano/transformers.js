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
  // Several threads when the page is cross-origin isolated (needs COOP/COEP headers), else one.
  mod.env.backends.onnx.wasm.numThreads = globalThis.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  mod.env.backends.onnx.wasm.wasmPaths = "/ort-tf/";
  return mod;
}

export const TRANSFORMERS_CACHE = "transformers-cache";
export const BUNDLED_MODELS = "/models/hf/";
const HUB = "https://huggingface.co/";
const HUB_TEMPLATE = "{model}/resolve/{revision}/";

let queue = Promise.resolve();
/**
 * Load a model from a given source. Transformers.js reads its file locations from one global
 * `env`, so loads run one at a time, each with its own settings:
 *   "bundled"            — shipped with the app (/models/hf/), Hugging Face as fallback
 *   { host: "https://…" } — hosted by the AwaVote server at <host>/<model id>/
 * @template T @param {"bundled" | {host: string}} source @param {(tf: any) => Promise<T>} fn @returns {Promise<T>}
 */
export function loadFrom(source, fn) {
  const run = queue.then(async () => {
    const tf = await getTransformers();
    if (source === "bundled") {
      tf.env.allowLocalModels = true;
      tf.env.localModelPath = BUNDLED_MODELS;
      tf.env.remoteHost = HUB;
      tf.env.remotePathTemplate = HUB_TEMPLATE;
    } else {
      tf.env.allowLocalModels = false;
      tf.env.remoteHost = source.host.replace(/\/?$/, "/");
      tf.env.remotePathTemplate = "{model}/";
    }
    return fn(tf);
  });
  queue = run.catch(() => {});
  return run;
}
