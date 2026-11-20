/* AwaVote service worker.
 * The precache list and version are injected at build time by scripts/build-sw.mjs.
 * Strategy:
 *   - App shell (every page, JS/CSS chunk, RSC payload, icon, the intent model and the
 *     ONNX Runtime WASM) is precached on install => the app starts and navigates offline.
 *   - Navigations: network-first (3.5 s timeout), falling back to the precached page.
 *   - Static assets & model files: cache-first.
 *   - API calls (another origin/port) are never cached here; the IndexedDB outbox handles them.
 * A new version waits until all AwaVote tabs are closed before taking over, so a running
 * session never mixes old and new code.
 */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE_MANIFEST__;
const SHELL_CACHE = `awavote-shell-${VERSION}`;
const RUNTIME_CACHE = "awavote-runtime";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Add in small batches so one slow file doesn't fail the whole install on a weak connection.
    for (let i = 0; i < PRECACHE.length; i += 8) {
      await cache.addAll(PRECACHE.slice(i, i + 8).map((u) => new Request(u, { cache: "reload" })));
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("awavote-shell-") && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function pageCandidates(url) {
  const p = url.pathname.replace(/\/$/, "") || "/";
  return p === "/" ? ["/", "/index.html"] : [p, `${p}.html`, `${p}/index.html`];
}

async function matchShell(url) {
  const cache = await caches.open(SHELL_CACHE);
  for (const c of pageCandidates(url)) {
    const hit = await cache.match(c, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

async function networkFirstPage(request) {
  const url = new URL(request.url);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3500)),
    ]);
    if (res.ok) return res;
    return (await matchShell(url)) || res;
  } catch {
    return (await matchShell(url)) || (await matchShell(new URL("/", url))) || Response.error();
  }
}

async function cacheFirst(request) {
  const shell = await caches.open(SHELL_CACHE);
  const hit = (await shell.match(request, { ignoreSearch: true })) || (await caches.match(request));
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") (await caches.open(RUNTIME_CACHE)).put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API + model hub: not handled here
  // Bundled AI models: Transformers.js keeps its own persistent cache ("transformers-cache"),
  // so caching them here as well would store ~80 MB twice on the phone.
  if (url.pathname.startsWith("/models/hf/")) return;
  // Same-origin deployments: API answers must never come from a cache, and the speech models
  // (/asr-models/) are kept by Transformers.js's own cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/asr-models/")) return;
  if (request.mode === "navigate") return event.respondWith(networkFirstPage(request));
  if (url.searchParams.has("_rsc")) {
    // Client-side navigation payloads: try network, fall back to the precached .txt payload.
    return event.respondWith(fetch(request).catch(() => caches.open(SHELL_CACHE).then((c) => c.match(url.pathname, { ignoreSearch: true })).then((r) => r || Response.error())));
  }
  event.respondWith(cacheFirst(request));
});

// Background Sync (Chromium only): wake open AwaVote windows to flush the IndexedDB outbox.
self.addEventListener("sync", (event) => {
  if (event.tag !== "awavote-outbox") return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.postMessage({ type: "awavote-sync" }));
  })());
});
