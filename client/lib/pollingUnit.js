/** Polling-unit codes are digits/letters separated by "-" or "/" (e.g. 24-11-05-003). */
export function cleanPuCode(v) {
  return v.toUpperCase().replace(/\s+/g, "-").replace(/[^0-9A-Z/-]/g, "").slice(0, 32);
}
