/**
 * Per-language voice packs built from APPROVED native-speaker recordings:
 *   commands: MFCC templates for on-device command recognition (any language)
 *   prompts:  recorded audio for spoken prompts (replaces text-to-speech)
 * Stored in IndexedDB so they work offline after one download.
 */
import { kvGet, kvSet, getDB, notifyChange } from "@/lib/db";
import { apiBase } from "@/services/api";

const memo = new Map();

export async function getPack(lang) {
  if (!memo.has(lang)) memo.set(lang, await kvGet(`voicepack:${lang}`));
  return memo.get(lang);
}

export async function installedPacks() {
  const keys = await (await getDB()).getAllKeys("kv");
  const out = {};
  for (const k of keys) if (typeof k === "string" && k.startsWith("voicepack:")) {
    const p = await kvGet(k);
    out[p.lang] = { version: p.version, commands: p.commands.length, speakers: p.speakers, prompts: Object.keys(p.prompts).length };
  }
  return out;
}

/** Download (or update) a language's pack. Returns null if nothing is approved yet. */
export async function installPack(lang, onProgress = () => {}) {
  const res = await fetch(`${apiBase()}/api/voice/${lang}/pack`);
  if (!res.ok) throw new Error(`Voice pack unavailable (${res.status})`);
  const pack = await res.json();
  if (!pack.commands.length && !Object.keys(pack.prompts).length) return null;
  const entries = Object.entries(pack.prompts);
  let done = 0;
  for (const [key, url] of entries) {
    const audio = await fetch(`${apiBase()}${url}`).then((r) => (r.ok ? r.blob() : null));
    if (audio) await kvSet(`voiceprompt:${lang}:${key}`, audio);
    onProgress(Math.round((++done / entries.length) * 100));
  }
  await kvSet(`voicepack:${lang}`, { ...pack, installedAt: new Date().toISOString() });
  memo.delete(lang);
  notifyChange("voicepacks");
  return pack;
}

export async function removePack(lang) {
  const db = await getDB();
  for (const k of await db.getAllKeys("kv")) {
    if (k === `voicepack:${lang}` || (typeof k === "string" && k.startsWith(`voiceprompt:${lang}:`))) await db.delete("kv", k);
  }
  memo.delete(lang);
  notifyChange("voicepacks");
}

export async function getPromptAudio(lang, key) {
  if (!key) return null;
  return kvGet(`voiceprompt:${lang}:${key}`);
}
