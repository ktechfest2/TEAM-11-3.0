/**
 * Automatic speech setup — users never configure anything.
 *
 * For the user's language we pick the best speech recogniser available:
 *   1. an N-ATLaS model hosted by this AwaVote server (en, pcm via en, yo, ha, ig)
 *   2. otherwise public Whisper-tiny (en, pcm via en, yo, ha) as an interim fallback
 *   3. otherwise native-speaker command templates (any language with a voice pack)
 * Whisper-tiny ships with the app (public/models/hf/, fetched from Hugging Face at build time),
 * so the user never downloads anything themselves: the app loads it in the background the
 * first time it is online and keeps it for offline use. The "needs-download" status only
 * remains as a retry when that background load failed.
 */
import { kvGet, kvSet } from "@/lib/db";
import { apiBase } from "@/services/api";
import { BUNDLED_MODELS, getTransformers, TRANSFORMERS_CACHE } from "./transformers";
import { getPack, installPack } from "./voicepack";

const HUB = "https://huggingface.co/";
const HUB_TEMPLATE = "{model}/resolve/{revision}/";
const TINY = { id: "onnx-community/whisper-tiny", name: "Whisper tiny (OpenAI)", sizeMB: 41, host: "bundled", attribution: "" };
const TINY_LANGS = { en: "english", pcm: "english", yo: "yoruba", ha: "hausa" };

// ---------------------------------------------------------------- catalogue
export async function getCatalog() {
  const cached = await kvGet("speechCatalog");
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const res = await fetch(`${apiBase()}/api/speech/models`);
      if (res.ok) {
        const fresh = await res.json();
        await kvSet("speechCatalog", fresh);
        return fresh;
      }
    } catch { /* offline or server down: use cached */ }
  }
  return cached || { models: [] };
}

/** Best recogniser for `lang` on this device, or null if only templates/typing are possible. */
export function chooseModel(lang, catalog, deviceMemoryGB = (typeof navigator !== "undefined" && navigator.deviceMemory) || null) {
  const hosted = catalog?.models?.find((m) => m.languages.includes(lang));
  const lowMemory = deviceMemoryGB !== null && deviceMemoryGB <= 2;
  if (hosted && !(lowMemory && TINY_LANGS[lang] && hosted.size_bytes > 150e6)) {
    return { id: hosted.id, name: hosted.name, sizeMB: Math.round(hosted.size_bytes / 1e6), host: "awavote",
      language: hosted.language_token ?? null, attribution: hosted.attribution, natlas: hosted.name.includes("Awarri") };
  }
  if (TINY_LANGS[lang]) return { ...TINY, language: TINY_LANGS[lang], natlas: false };
  if (hosted) {
    return { id: hosted.id, name: hosted.name, sizeMB: Math.round(hosted.size_bytes / 1e6), host: "awavote",
      language: hosted.language_token ?? null, attribution: hosted.attribution, natlas: hosted.name.includes("Awarri"), heavy: true };
  }
  return null;
}

// ---------------------------------------------------------------- model files
async function configure(choice) {
  const tf = await getTransformers();
  if (choice.host === "awavote") {
    tf.env.allowLocalModels = false;
    tf.env.remoteHost = `${apiBase()}/models/`;
    tf.env.remotePathTemplate = "{model}/";
  } else {
    tf.env.allowLocalModels = true; // bundled copy first, Hugging Face as fallback
    tf.env.remoteHost = HUB;
    tf.env.remotePathTemplate = HUB_TEMPLATE;
  }
  return tf;
}

export async function isModelCached(choice) {
  if (!choice || typeof caches === "undefined") return false;
  try {
    const keys = await (await caches.open(TRANSFORMERS_CACHE)).keys();
    const hits = keys.filter((k) => k.url.includes(`/${choice.id}/`));
    if (hits.some((k) => k.url.includes("decoder_model_merged")) && hits.some((k) => k.url.includes("encoder_model"))) return true;
    // Bundled files may instead sit in the service worker's cache.
    if (choice.host !== "bundled") return false;
    const base = `${BUNDLED_MODELS}${choice.id}/onnx/`;
    return Boolean((await caches.match(`${base}encoder_model_quantized.onnx`)) && (await caches.match(`${base}decoder_model_merged_quantized.onnx`)));
  } catch {
    return false;
  }
}

let loaded = null; // { id, pipe }

/** Load (downloading if needed) the recogniser. `onProgress(pct)` reports download progress. */
export async function loadRecognizer(choice, onProgress) {
  if (loaded?.id === choice.id) return loaded.pipe;
  await releaseRecognizer();
  const { pipeline } = await configure(choice);
  const files = new Map();
  const pipe = await pipeline("automatic-speech-recognition", choice.id, {
    dtype: "q8", device: "wasm",
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) files.set(p.file, [p.loaded, p.total]);
      let l = 0, t = 0;
      for (const [a, b] of files.values()) { l += a; t += b; }
      if (t && onProgress) onProgress(Math.min(100, Math.round((l / t) * 100)));
    },
  });
  loaded = { id: choice.id, pipe };
  return pipe;
}

export async function releaseRecognizer() {
  if (loaded) {
    await loaded.pipe.dispose?.();
    loaded = null;
  }
}

// ---------------------------------------------------------------- automatic setup
let inflight = null;

/**
 * Make speech ready for `lang`. Emits status objects via `onStatus`:
 *   {status: "checking"|"ready"|"downloading"|"needs-download"|"templates"|"unavailable", ...}
 * Loads automatically whenever online; `needs-download` only appears if that failed (retry).
 */
export async function ensureSpeech(lang, onStatus) {
  onStatus({ status: "checking" });
  const catalog = await getCatalog();
  const choice = chooseModel(lang, catalog);

  // Small native-speaker template packs install automatically whenever online.
  let pack = await getPack(lang);
  if (navigator.onLine && lang !== "en") {
    try { pack = (await installPack(lang)) || pack; } catch { /* no pack published yet */ }
  }

  if (!choice) {
    onStatus(pack?.commands?.length ? { status: "templates", lang } : { status: "unavailable", lang });
    return;
  }
  const base = { lang, model: choice };
  if (await isModelCached(choice)) { onStatus({ ...base, status: "ready" }); return; }
  if (!navigator.onLine) { onStatus({ ...base, status: pack?.commands?.length ? "templates" : "needs-download", offline: true }); return; }

  if (inflight?.id === choice.id) return inflight.promise;
  const promise = (async () => {
    onStatus({ ...base, status: "downloading", pct: 0 });
    try {
      await loadRecognizer(choice, (pct) => onStatus({ ...base, status: "downloading", pct }));
      await releaseRecognizer(); // cached on disk; free memory until the user speaks
      onStatus({ ...base, status: "ready" });
    } catch (e) {
      onStatus({ ...base, status: "needs-download", error: e.message });
    } finally {
      inflight = null;
    }
  })();
  inflight = { id: choice.id, promise };
  return promise;
}
