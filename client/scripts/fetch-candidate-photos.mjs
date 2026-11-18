// Downloads the hand-checked candidate photos listed in candidate-photos.vetted.json from
// Wikimedia Commons, crops them to small square WebP files in public/media/candidates/, and
// writes public/data/elections/2027/candidate_photos.json with the licence credit for each.
// The output is committed, so the app shows the photos offline with no runtime download.
//   node scripts/fetch-candidate-photos.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = new URL("..", import.meta.url).pathname;
const { photos } = JSON.parse(readFileSync(`${root}scripts/candidate-photos.vetted.json`, "utf8"));
const OUT = `${root}public/media/candidates/`;
const UA = { "User-Agent": "AwaVote-candidate-photos/0.1 (voter-information app)" };
mkdirSync(OUT, { recursive: true });

const strip = (html) => (html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function get(url, tries = 6) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) }).catch((e) => ({ ok: false, statusText: e.cause?.code || e.message }));
    if (res.ok) return res;
    if (i >= tries) throw new Error(`${url}: ${res.status || ""} ${res.statusText}`);
    await new Promise((r) => setTimeout(r, (res.status === 429 ? 15000 : 3000) * i));
  }
}
const getJSON = async (url) => (await get(url)).json();

// Commons metadata (thumbnail URL, author, licence) for all files, 40 per request.
const entries = Object.entries(photos);
const info = {};
for (let i = 0; i < entries.length; i += 40) {
  const titles = entries.slice(i, i + 40).map(([, p]) => `File:${p.commons_file}`).join("|");
  const q = new URLSearchParams({ action: "query", titles, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "320", format: "json", formatversion: "2" });
  // COMMONS_META=<file> reuses a saved API response (handy when the network is flaky).
  const d = process.env.COMMONS_META ? JSON.parse(readFileSync(process.env.COMMONS_META, "utf8")) : await getJSON(`https://commons.wikimedia.org/w/api.php?${q}`);
  const norm = Object.fromEntries((d.query.normalized || []).map((n) => [n.to, n.from]));
  for (const page of d.query.pages) info[(norm[page.title] || page.title).replace(/^File:/, "")] = page.imageinfo?.[0];
}

const manifest = {};
for (const [name, p] of entries) {
  const ii = info[p.commons_file] || info[p.commons_file.replace(/_/g, " ")];
  if (!ii) { console.log(`SKIP ${name}: no Commons info for ${p.commons_file}`); continue; }
  const meta = ii.extmetadata || {};
  const license = strip(meta.LicenseShortName?.value) || "see source";
  if (/fair use|non-free/i.test(license)) { console.log(`SKIP ${name}: ${license}`); continue; }
  const file = `${slug(name)}.webp`;
  if (!existsSync(OUT + file)) {
    const buf = Buffer.from(await (await get(ii.thumburl)).arrayBuffer());
    let img = sharp(buf);
    if (p.crop) { // hand-picked square around the face: [left, top, size] as fractions
      const { width, height } = await sharp(buf).metadata();
      const size = Math.round(p.crop[2] * width);
      img = img.extract({ left: Math.round(p.crop[0] * width), top: Math.round(p.crop[1] * height), width: size, height: Math.min(size, height - Math.round(p.crop[1] * height)) });
    }
    await img.resize(160, 160, { fit: "cover", position: sharp.strategy.attention }).webp({ quality: 78 }).toFile(OUT + file);
    await new Promise((r) => setTimeout(r, 1500)); // be gentle with upload.wikimedia.org
  }
  manifest[name] = { file, credit: strip(meta.Artist?.value) || "Wikimedia Commons", license, source: ii.descriptionurl, wikidata: p.wikidata };
  console.log(`${name} <- ${p.commons_file} (${license})`);
}
writeFileSync(`${root}public/data/elections/2027/candidate_photos.json`, JSON.stringify(manifest, null, 1));
console.log(`${Object.keys(manifest).length} photos written`);
