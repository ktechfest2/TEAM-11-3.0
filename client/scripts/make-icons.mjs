// Renders the PWA icons in public/icons/ from public/favicon.svg (the same design as
// public/favicon.ico) using headless Chrome. Run by hand after changing the favicon:
//   node scripts/make-icons.mjs [path-to-chrome]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pub = new URL("../public/", import.meta.url).pathname;
const chrome = process.argv[2] || "google-chrome";
const svg = readFileSync(join(pub, "favicon.svg"), "utf8");
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<rect width="64"[^>]*\/>/, "");
const full = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${64 + 2 * pad} ${64 + 2 * pad}">` +
  `<rect x="${-pad}" y="${-pad}" width="${64 + 2 * pad}" height="${64 + 2 * pad}" fill="#003D27"/>${inner}</svg>`;
const style = "<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>";

const tmp = mkdtempSync(join(tmpdir(), "awavote-icons-"));
function render(name, size, markup) {
  const page = join(tmp, "page.html");
  writeFileSync(page, style + markup);
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--default-background-color=00000000",
    `--window-size=${size},${size}`, `--screenshot=${join(pub, "icons", name)}`, `file://${page}`], { stdio: "ignore" });
  console.log(`icons/${name}`);
}
render("icon-192.png", 192, svg);
render("icon-512.png", 512, svg);
render("apple-touch-icon.png", 180, full(0)); // iOS rounds the corners itself
render("icon-maskable-512.png", 512, full(8)); // content inside the maskable safe zone
rmSync(tmp, { recursive: true, force: true });
