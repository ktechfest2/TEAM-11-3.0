// Minimal static server for the production build (out/), with clean URLs (/countcam -> countcam.html).
// Usage: node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../out/", import.meta.url).pathname;
const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".txt": "text/plain; charset=utf-8",
  ".gz": "application/gzip", ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
};

function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  for (const c of [clean, `${clean}.html`, join(clean, "index.html")]) {
    const p = join(ROOT, c);
    if (p.startsWith(ROOT) && existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

createServer((req, res) => {
  const path = resolve(new URL(req.url, "http://x").pathname);
  if (!path) { res.writeHead(404, { "content-type": "text/html" }); return createReadStream(join(ROOT, "404.html")).on("error", () => res.end("Not found")).pipe(res); }
  const headers = { "content-type": TYPES[extname(path)] || "application/octet-stream" };
  if (path.endsWith("sw.js")) headers["cache-control"] = "no-cache";
  else if (path.includes("/_next/static/")) headers["cache-control"] = "public, max-age=31536000, immutable";
  res.writeHead(200, headers);
  createReadStream(path).pipe(res);
}).listen(PORT, () => console.log(`AwaVote static build on http://localhost:${PORT}`));
