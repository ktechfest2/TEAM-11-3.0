/** Download (and cache) a model pack, reporting aggregate progress 0-100. */
import { getTransformers } from "./transformers";
import { whisperLocal } from "./asr";

function progressAggregator(onProgress) {
  const files = new Map();
  return (p) => {
    if (p.status === "progress" && p.total) files.set(p.file, [p.loaded, p.total]);
    if (p.status === "done" && files.has(p.file)) { const [, tot] = files.get(p.file); files.set(p.file, [tot, tot]); }
    let l = 0, tot = 0;
    for (const [a, b] of files.values()) { l += a; tot += b; }
    if (tot) onProgress(Math.min(100, Math.round((l / tot) * 100)));
  };
}

export async function downloadPack(pack, onProgress = () => {}) {
  const cb = progressAggregator(onProgress);
  if (pack.id === "asr-whisper-tiny") {
    await whisperLocal.load(cb);
    await whisperLocal.release(); // cached on disk; free memory until actually used
    return;
  }
  const { pipeline } = await getTransformers();
  const task = pack.kind === "tts" ? "text-to-speech" : "feature-extraction";
  const p = await pipeline(task, pack.hfModel, { dtype: "q8", device: "wasm", progress_callback: cb });
  await p.dispose?.();
}
