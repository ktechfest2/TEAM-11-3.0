import { MACHINE } from "@/lib/i18n/machine";
import { MESSAGES, SOURCE_MESSAGES } from "@/lib/i18n/messages";

export const TOTAL_KEYS = Object.keys(SOURCE_MESSAGES).length;

/** Languages with an on-device N-ATLaS speech model (English and Pidgin share one). */
const SPEECH_MODEL = { en: "N-ATLaS Nigerian English", pcm: "N-ATLaS Nigerian English", yo: "N-ATLaS Yoruba", ha: "N-ATLaS Hausa", ig: "N-ATLaS Igbo" };

/**
 * What AwaVote offers in one language, from the bundled data.
 * @returns {{ui: {pct}, voice: {state, model}}}
 */
export function languageSupport(code, stats) {
  if (code === "en") return { ui: { pct: 100 }, voice: { state: "model", model: SPEECH_MODEL.en } };
  const keys = new Set([...Object.keys(MESSAGES[code] || {}), ...Object.keys(MACHINE[code] || {})]);
  const approved = stats?.languages?.[code]?.translations_approved || 0;
  const pct = Math.min(100, Math.round((Math.max(keys.size, approved) / TOTAL_KEYS) * 100));
  const voice = SPEECH_MODEL[code] ? { state: "model", model: SPEECH_MODEL[code] }
    : stats?.languages?.[code]?.command_templates ? { state: "recordings" } : { state: "none" };
  return { ui: { pct }, voice };
}
