// Generates the app icons (green rounded square with a white tick) as PNGs, no dependencies.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel((x + 0.5) / size, (y + 0.5) / size, 1 / size);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const clamp = (v) => Math.max(0, Math.min(1, v));
// Mirrors components/layout/Logo.js: green tile, ballot-box slot, marigold tick.
function icon({ inset = 0, radius = 0.275, full = false }) {
  const GREEN = [15, 92, 61], WHITE = [255, 253, 248], GOLD = [233, 162, 59];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
  return (x, y, px) => {
    let bg = 1;
    if (!full) {
      const qx = Math.abs(x - 0.5) - (0.5 - radius), qy = Math.abs(y - 0.5) - (0.5 - radius);
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
      bg = clamp(0.5 - d / px);
    }
    const s = 1 - inset * 2, u = (x - inset) / s, v = (y - inset) / s, ps = px / s;
    // slot: rounded bar from (9,9) to (31,13) on a 40-unit grid
    const sx = Math.abs(u - 0.5) - 0.25, sy = Math.abs(v - 0.275) - 0.05;
    const ds = Math.hypot(Math.max(sx, 0), Math.max(sy, 0)) + Math.min(Math.max(sx, sy), 0) - 0.0;
    const slot = clamp(0.5 - ds / ps) * 0.9;
    // tick: (12.5,23.5) -> (17.5,28.5) -> (28,17.5), stroke width 4
    const dt = Math.min(segDist(u, v, 0.3125, 0.5875, 0.4375, 0.7125), segDist(u, v, 0.4375, 0.7125, 0.7, 0.4375));
    const tick = clamp(0.5 - (dt - 0.05) / ps);
    let c = mix(GREEN, WHITE, slot);
    c = mix(c, GOLD, tick);
    return [...c, Math.round(255 * bg)];
  };
}
const out = new URL("../public/icons/", import.meta.url).pathname;
writeFileSync(out + "icon-192.png", png(192, icon({})));
writeFileSync(out + "icon-512.png", png(512, icon({})));
writeFileSync(out + "apple-touch-icon.png", png(180, icon({ full: true })));
writeFileSync(out + "icon-maskable-512.png", png(512, icon({ full: true, inset: 0.12 })));
console.log("icons written");
