import { MESSAGES, SOURCE_MESSAGES } from "@/lib/i18n/messages";

export const TOTAL_KEYS = Object.keys(SOURCE_MESSAGES).length;

/**
 * Honest support summary for one language, from measured data only.
 * @returns {{ui: {pct, reviewed}, voice: {state, accuracy, speakers}, audio: {count}}}
 */
export function languageSupport(code, stats) {
  if (code === "en") return { ui: { pct: 100, reviewed: true }, voice: { state: "builtin" }, audio: { count: 0 } };
  const s = stats?.languages?.[code];
  const approved = s?.translations_approved || 0;
  const bundledDrafts = Object.keys(MESSAGES[code] || {}).length;
  const ev = s?.evaluation;
  let voice = { state: "none" };
  if (s?.command_templates) {
    voice = ev?.validated ? { state: "validated", accuracy: ev.accuracy, speakers: ev.held_out_speakers }
      : { state: "testing", accuracy: ev?.accuracy ?? null, speakers: ev?.held_out_speakers || 0 };
  }
  return {
    ui: { pct: Math.round((Math.max(approved, 0) / TOTAL_KEYS) * 100), reviewed: approved > 0, drafts: bundledDrafts },
    voice,
    audio: { count: s?.prompts_approved || 0 },
  };
}
