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

/**
 * Where the on-device speech models (and their registry.json) are served from. Default: the API
 * server's /asr-models. NEXT_PUBLIC_MODELS_URL overrides it, e.g. "/asr-models" when a static host
 * serves the models next to the app.
 */
export function modelsBase() {
  const m = process.env.NEXT_PUBLIC_MODELS_URL;
  if (!m) return `${apiBase()}/asr-models`;
  const clean = m.replace(/\/$/, "");
  return clean.startsWith("/") && typeof location !== "undefined" ? location.origin + clean : clean;
}
import { BUNDLED_MODELS, TRANSFORMERS_CACHE } from "./transformers";
import { getPack, installPack } from "./voicepack";

const TINY = { id: "onnx-community/whisper-tiny", name: "Whisper tiny (OpenAI)", sizeMB: 41, host: "bundled", attribution: "" };
const TINY_LANGS = { en: "english", pcm: "english", yo: "yoruba", ha: "hausa" };

// ---------------------------------------------------------------- catalogue
export async function getCatalog() {
  const cached = await kvGet("speechCatalog");
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_MODELS_URL ? `${modelsBase()}/registry.json` : `${apiBase()}/api/speech/models`);
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
      language: hosted.language_token ?? null, attribution: hosted.attribution, natlas: hosted.name.includes("Awarri"), files: hosted.files, dynamicWindow: !!hosted.dynamic_window };
  }
  if (TINY_LANGS[lang]) return { ...TINY, language: TINY_LANGS[lang], natlas: false };
  if (hosted) {
    return { id: hosted.id, name: hosted.name, sizeMB: Math.round(hosted.size_bytes / 1e6), host: "awavote",
      language: hosted.language_token ?? null, attribution: hosted.attribution, natlas: hosted.name.includes("Awarri"), heavy: true, files: hosted.files, dynamicWindow: !!hosted.dynamic_window };
  }
  return null;
}

// ---------------------------------------------------------------- model files
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

let loaded = null; // { id, worker, ready }
let keepLoaded = false;
let seq = 0;
/** Hands-free mode keeps the recogniser in memory so the first command is answered quickly. */
export function setKeepLoaded(v) { keepLoaded = !!v; }

function call(worker, msg, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const onMsg = ({ data }) => {
      if (data.id !== id) return;
      if (data.type === "progress") { onProgress?.(data.pct); return; }
      worker.removeEventListener("message", onMsg);
      worker.removeEventListener("error", onErr);
      data.ok ? resolve(data) : reject(new Error(data.error));
    };
    const onErr = (e) => { worker.removeEventListener("message", onMsg); reject(new Error(e.message || "speech worker crashed")); };
    worker.addEventListener("message", onMsg);
    worker.addEventListener("error", onErr);
    worker.postMessage({ ...msg, id });
  });
}

/**
 * Load (downloading if needed) the recogniser in its own worker. A different model replaces the
 * current worker entirely, so memory never piles up when the user switches languages.
 * `onProgress(pct)` reports download progress.
 */
export async function loadRecognizer(choice, onProgress) {
  if (loaded?.id === choice.id) { await loaded.ready; return loaded; }
  await releaseRecognizer();
  const worker = new Worker("/asr-worker.js", { type: "module" });
  const msg = choice.host === "awavote"
    ? { type: "load", model: choice.id, source: "hosted", host: `${modelsBase()}/` }
    : { type: "load", model: choice.id, source: "bundled", localPath: BUNDLED_MODELS };
  const entry = { id: choice.id, worker, ready: call(worker, msg, onProgress) };
  loaded = entry;
  try { await entry.ready; } catch (e) { if (loaded === entry) { worker.terminate(); loaded = null; } throw e; }
  return entry;
}

/**
 * Transcribe 16 kHz mono `pcm` with `choice`. Models with a dynamic window (see
 * ai/speech_to_text/shorten_window.py) encode only ~10 s instead of Whisper's fixed 30 s, which
 * is ~4x faster on a phone; `full: true` forces the classic 30 s window (used as a fallback).
 */
const fixedWindow = new Set(); // model ids whose short-window run failed (e.g. an old cached encoder)

export async function transcribe(choice, pcm, { full = false } = {}) {
  await refreshStale(choice).catch(() => {});
  const rec = await loadRecognizer(choice);
  const short = !!choice.dynamicWindow && !full && !fixedWindow.has(choice.id);
  try {
    const r = await call(rec.worker, { type: "transcribe", pcm, language: choice.language || null, short });
    return { text: r.text, short };
  } catch (e) {
    if (!short) throw e;
    console.warn("short-window transcription failed; using the full 30 s window", e);
    fixedWindow.add(choice.id);
    await releaseRecognizer(); // a fresh worker: the failed session may be unusable
    return transcribe(choice, pcm, { full: true });
  }
}

/**
 * Drop cached model files that no longer match the server's registry (the model was updated),
 * so the next load fetches the new version. Bypasses the HTTP cache: model URLs are cached as immutable.
 */
const checkedStale = new Set();
export async function refreshStale(choice) {
  if (!choice?.files || choice.host !== "awavote" || typeof caches === "undefined" || !navigator.onLine) return 0;
  if (checkedStale.has(choice.id)) return 0;
  checkedStale.add(choice.id);
  const cache = await caches.open(TRANSFORMERS_CACHE);
  let n = 0;
  for (const [name, f] of Object.entries(choice.files)) {
    const url = `${modelsBase()}/${choice.id}/${name}`;
    const hit = await cache.match(url);
    const len = hit && Number(hit.headers.get("content-length"));
    if (hit && len && len !== f.bytes) {
      await cache.delete(url);
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) await cache.put(url, res);
      n++;
    }
  }
  if (n && loaded?.id === choice.id) await releaseRecognizer();
  return n;
}

export async function releaseRecognizer() {
  if (loaded) {
    loaded.worker.terminate(); // frees all of the model's memory
    loaded = null;
  }
}

// ---------------------------------------------------------------- other languages
/**
 * Download a hosted model's files into the same cache Transformers.js reads from, WITHOUT
 * loading it into memory (so the model in use is not disturbed). Used so that switching to
 * another spoken language is instant and works offline later.
 */
export async function prefetchModel(choice, onProgress) {
  if (!choice || choice.host !== "awavote" || !choice.files || typeof caches === "undefined") return false;
  const cache = await caches.open(TRANSFORMERS_CACHE);
  const names = Object.keys(choice.files);
  const total = names.reduce((n, f) => n + choice.files[f].bytes, 0);
  let done = 0;
  for (const name of names) {
    const url = `${modelsBase()}/${choice.id}/${name}`; // = Transformers.js's cache key for this file
    if (!(await cache.match(url))) {
      const res = await fetch(url, { cache: "reload" });
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      await cache.put(url, res);
    }
    done += choice.files[name].bytes;
    onProgress?.(Math.round((done / total) * 100));
  }
  return true;
}

let prefetching = null;
/**
 * Fetch the speech models for every other language in the background, one at a time, so the
 * app can follow whatever language the user speaks. Wi-Fi only unless `force` (each is ~290 MB).
 */
export function prefetchAllLanguages({ force = false, except = [] } = {}) {
  if (prefetching) return prefetching;
  prefetching = (async () => {
    if (!navigator.onLine || (!force && !unmetered())) return;
    const catalog = await getCatalog();
    for (const m of catalog.models || []) {
      const choice = chooseModel(m.languages[0], catalog);
      if (!choice || choice.host !== "awavote" || except.includes(choice.id)) continue;
      await refreshStale(choice).catch(() => {});
      if (await isModelCached(choice)) continue;
      try { await prefetchModel(choice); } catch { /* try again next time */ }
    }
  })().finally(() => { prefetching = null; });
  return prefetching;
}

function unmetered() {
  const c = typeof navigator !== "undefined" && navigator.connection;
  if (!c) return true; // desktop browsers without the API: assume a fixed connection
  if (c.saveData) return false;
  return c.type === "wifi" || c.type === "ethernet" || c.type === undefined;
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
  await refreshStale(choice).catch(() => {});
  if (await isModelCached(choice)) { onStatus({ ...base, status: "ready" }); return; }
  if (!navigator.onLine) { onStatus({ ...base, status: pack?.commands?.length ? "templates" : "needs-download", offline: true }); return; }

  if (inflight?.id === choice.id) return inflight.promise;
  const promise = (async () => {
    onStatus({ ...base, status: "downloading", pct: 0 });
    try {
      await loadRecognizer(choice, (pct) => onStatus({ ...base, status: "downloading", pct }));
      if (!keepLoaded) await releaseRecognizer(); // cached on disk; free memory until the user speaks
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
