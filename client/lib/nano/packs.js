/**
 * Optional extra model packs. Speech recognition is NOT here: it is set up automatically
 * (see ./speech.js). Sizes/licences were checked against the Hugging Face repos (Nov 2026).
 */
import { TRANSFORMERS_CACHE } from "./transformers";

export const PACKS = [
  {
    id: "intent-core", kind: "intent", builtIn: true, sizeMB: 0.37,
    title: "Command understanding (core)", model: "awavote-nano-intent v1 (seed)",
    languages: ["en", "pcm", "yo", "ha", "ig"], license: "Project-owned",
    note: "Trained on a small developer-written seed set. Accuracy in Yoruba, Hausa, Igbo and Pidgin is unvalidated.",
  },
  {
    id: "tts-mms-yor", kind: "tts", sizeMB: 38, hfModel: "Xenova/mms-tts-yor",
    title: "Yoruba voice", model: "Meta MMS-TTS Yoruba (int8)",
    languages: ["yo"], license: "CC-BY-NC-4.0 (non-commercial only)",
    note: "Non-commercial licence. Hausa and Igbo MMS voices need ONNX conversion before they can be offered.",
  },
  {
    id: "intent-minilm", kind: "intent", sizeMB: 118, hfModel: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    title: "Enhanced command understanding", model: "Multilingual MiniLM-L12 (int8)",
    languages: ["en"], license: "Apache-2.0",
    note: "12x over the 10 MB intent budget because of its 250k-token vocabulary. Not trained on Yoruba, Hausa, Igbo or Pidgin. Experimental.",
  },
];

/** Is every file of a Transformers.js pack present in Cache Storage? (heuristic: any entry for the repo) */
export async function isPackInstalled(pack) {
  if (pack.builtIn) return true;
  if (typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(TRANSFORMERS_CACHE);
    const keys = await cache.keys();
    return keys.some((k) => k.url.includes(`/${pack.hfModel}/`));
  } catch {
    return false;
  }
}

export async function removePack(pack) {
  if (pack.builtIn || typeof caches === "undefined") return;
  const cache = await caches.open(TRANSFORMERS_CACHE);
  for (const k of await cache.keys()) if (k.url.includes(`/${pack.hfModel}/`)) await cache.delete(k);
}
