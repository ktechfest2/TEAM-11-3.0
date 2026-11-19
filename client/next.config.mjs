export const ISOLATION_HEADERS = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the whole PWA is client-rendered, so it can be served by any static host
  // (or by the local backend box) and precached by the service worker for offline use.
  output: "export",
  images: { unoptimized: true },
  // Cross-origin isolation lets the on-device speech models use several CPU threads
  // (SharedArrayBuffer). Dev server only: in production the static host must send the same
  // two headers (scripts/serve.mjs does; see docs for nginx/Netlify/Vercel).
  async headers() {
    return [{ source: "/:path*", headers: ISOLATION_HEADERS }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
