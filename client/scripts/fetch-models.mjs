// Downloads the on-device AI models from Hugging Face into public/models/hf/ so they ship with
// the app. Phones then fetch them from AwaVote's own origin, automatically and without any
// "download" button, and keep them for offline use. Files already present are skipped, so
// this only hits the network the first time. Runs before `dev` and `build`.
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const OUT = new URL("../public/models/hf/", import.meta.url).pathname;
const HUB = "https://huggingface.co";
const log = (m) => console.log(`[fetch-models] ${m}`);

/** repo -> files. Only the int8 ("q8" = *_quantized) weights the app actually loads. */
export const BUNDLED = {
  // Speech recognition (en, pcm, yo, ha). MIT. ~41 MB.
  "onnx-community/whisper-tiny": [
    "config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json",
    "added_tokens.json", "special_tokens_map.json", "normalizer.json", "vocab.json", "merges.txt",
    "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx",
  ],
  // Yoruba read-aloud voice. CC-BY-NC-4.0. ~38 MB.
  "Xenova/mms-tts-yor": [
    "config.json", "tokenizer.json", "tokenizer_config.json", "added_tokens.json", "special_tokens_map.json", "vocab.json",
    "onnx/model_quantized.onnx",
  ],
};

async function download(repo, file, attempts = 5) {
  const dest = join(OUT, repo, file);
  if (existsSync(dest) && statSync(dest).size > 0) return false;
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(`${HUB}/${repo}/resolve/main/${file}`, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
      renameSync(tmp, dest);
      return true;
    } catch (e) {
      rmSync(tmp, { force: true });
      if (i >= attempts) throw new Error(`${repo}/${file}: ${e.message}`);
      log(`retry ${i} ${repo}/${file} (${e.message})`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

let fetched = 0, failed = 0;
for (const [repo, files] of Object.entries(BUNDLED)) {
  for (const f of files) {
    try { if (await download(repo, f)) { fetched++; log(`${repo}/${f}`); } }
    catch (e) { failed++; log(`ERROR ${e.message}`); }
  }
}
log(failed ? `${failed} file(s) missing — the app will fall back to Hugging Face for those.` : `ready (${fetched} downloaded, rest already present)`);
