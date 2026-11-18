/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the whole PWA is client-rendered, so it can be served by any static host
  // (or by the local backend box) and precached by the service worker for offline use.
  output: "export",
  images: { unoptimized: true },
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
