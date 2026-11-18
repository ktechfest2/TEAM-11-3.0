/** Hashing + at-rest encryption helpers (Web Crypto). Requires a secure context (HTTPS or localhost). */
import { kvGet, kvSet } from "./db";

export function uuid() {
  return crypto.randomUUID();
}

export function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data) {
  const buf = data instanceof Blob ? await data.arrayBuffer() : typeof data === "string" ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", buf));
}

/**
 * Evidence blobs are encrypted at rest with AES-GCM using a NON-EXTRACTABLE key kept in
 * IndexedDB. This protects against reading the raw browser storage files (e.g. a copied
 * profile); it does NOT protect against someone using the unlocked device and app.
 */
async function getStorageKey() {
  let key = await kvGet("evidenceKey");
  if (!key) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await kvSet("evidenceKey", key);
  }
  return key;
}

export async function encryptBlob(blob) {
  const key = await getStorageKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await blob.arrayBuffer());
  return { iv, data, type: blob.type, size: blob.size };
}

export async function decryptBlob(sealed) {
  if (!sealed) return null;
  const key = await getStorageKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.iv }, key, sealed.data);
  return new Blob([plain], { type: sealed.type });
}
