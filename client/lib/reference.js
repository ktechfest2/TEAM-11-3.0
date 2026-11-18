/** Mirrors server/services/references.py so references are identical offline and online. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PREFIX = { evidence: "EV", incident: "IN", result: "RS" };

export async function makeReference(kind, recordId, createdAtIso) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(recordId)));
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[digest[i] % ALPHABET.length];
  const d = new Date(createdAtIso);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `AWV-${PREFIX[kind]}-${ymd}-${code}`;
}
