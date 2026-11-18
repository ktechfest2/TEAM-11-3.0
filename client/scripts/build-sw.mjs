// Post-build: inject the precache manifest + content version into out/sw.js.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = new URL("../out/", import.meta.url).pathname;
const MAX_BYTES = 15 * 1024 * 1024;
// Not precached (kept small for users on expensive mobile data). These are cached by the
// service worker on first use instead:
//   tesseract/  OCR engine + English data (~15 MB), cached the first time OCR runs online
//   ort-tf/     runtime for speech + voice models, cached when they load (automatically)
//   models/hf/  bundled speech + voice models (~80 MB), loaded in the background and kept in
//               Transformers.js's own cache (see lib/nano/speech.js, AppProvider)
//   _next/static/media/*.wasm  bundler-emitted duplicates of the ORT runtime (we load /ort/)
const SKIP = [/^_next\/static\/media\/.*\.wasm$/, /^sw\.js$/, /^tesseract\//, /^ort-tf\//, /^models\/hf\//, /^audio\/.+\.(mp3|ogg|wav)$/, /\.map$/,
  // Election data: the reference, presidential + governorship lists and the index are precached
  // (~200 KB); per-state Senate/Reps/Assembly lists (~2.3 MB total) are cached when first opened.
  /^data\/(?!elections\/2027\/[a-z_]+\.json$)/];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const hash = createHash("sha256");
const urls = [];
let total = 0;
for (const file of walk(OUT).sort()) {
  const rel = relative(OUT, file).split(sep).join("/");
  const size = statSync(file).size;
  if (SKIP.some((r) => r.test(rel)) || size > MAX_BYTES) continue;
  hash.update(rel).update(readFileSync(file));
  urls.push(rel === "index.html" ? "/" : `/${rel}`);
  total += size;
}
const version = hash.digest("hex").slice(0, 12);
const sw = readFileSync(join(OUT, "sw.js"), "utf8")
  .replace("__VERSION__", version)
  .replace("__PRECACHE_MANIFEST__", JSON.stringify(urls));
writeFileSync(join(OUT, "sw.js"), sw);
console.log(`sw.js: version ${version}, ${urls.length} files, ${(total / 1e6).toFixed(1)} MB precached`);
