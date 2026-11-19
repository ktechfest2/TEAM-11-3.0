/**
 * Speech-recognition worker (plain file in public/, not bundled: see scripts/copy-runtime-assets.mjs). Holds ONE speech model. To switch model (e.g. the user starts
 * speaking another language) the app terminates this worker and starts a new one: that is the
 * only way to hand the model's memory back to the phone, because WebAssembly memory can grow
 * but never shrink. Running here also keeps the screen responsive while a phrase is decoded.
 *
 * Messages in:  {id, type: "load", model, source: "bundled"|"hosted", host?, localPath?}
 *               {id, type: "transcribe", pcm: Float32Array (16 kHz), language?, short}
 * Messages out: {id, ok, text?, error?} and {id, type: "progress", pct}
 */
import { env, pipeline } from "./vendor/transformers.min.js";

env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = "/ort-tf/";
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;

let pipe = null;

self.onmessage = async ({ data: m }) => {
  const reply = (x) => self.postMessage({ id: m.id, ...x });
  try {
    if (m.type === "load") {
      if (m.source === "bundled") {
        env.allowLocalModels = true;
        env.localModelPath = m.localPath;
        env.remoteHost = "https://huggingface.co/";
        env.remotePathTemplate = "{model}/resolve/{revision}/";
      } else {
        env.allowLocalModels = false;
        env.remoteHost = m.host;
        env.remotePathTemplate = "{model}/";
      }
      const files = new Map();
      pipe = await pipeline("automatic-speech-recognition", m.model, {
        dtype: "q8", device: "wasm",
        progress_callback: (p) => {
          if (p.status !== "progress" || !p.total) return;
          files.set(p.file, [p.loaded, p.total]);
          let l = 0, t = 0;
          for (const [a, b] of files.values()) { l += a; t += b; }
          self.postMessage({ id: m.id, type: "progress", pct: Math.min(100, Math.round((l / t) * 100)) });
        },
      });
      reply({ ok: true });
    } else if (m.type === "transcribe") {
      if (!pipe) throw new Error("no model loaded");
      reply({ ok: true, text: await transcribe(m.pcm, m.language, m.short) });
    }
  } catch (e) {
    reply({ ok: false, error: String(e?.message || e) });
  }
};

/**
 * Short window: encode only ~10 s instead of Whisper's fixed 30 s (needs an encoder patched by
 * ai/speech_to_text/shorten_window.py) — ~4x faster. Output capped at 40 tokens: commands are
 * short, and noise can make Whisper ramble on for a minute.
 */
async function transcribe(pcm, language, short) {
  if (!short) {
    const out = await pipe(pcm, { task: "transcribe", max_new_tokens: 40, ...(language && { language }) });
    return (out.text || "").trim();
  }
  const { input_features } = await pipe.processor(pcm);
  const frames = Math.min(3000, 2 * Math.ceil(Math.max(1000, Math.ceil(pcm.length / 160) + 100) / 2));
  const ids = await pipe.model.generate({
    inputs: input_features.slice(null, null, [0, frames]), task: "transcribe", max_new_tokens: 40, ...(language && { language }),
  });
  return (pipe.tokenizer.batch_decode(ids, { skip_special_tokens: true })[0] || "").trim();
}
