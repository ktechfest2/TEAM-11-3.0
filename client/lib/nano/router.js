/**
 * Voice command router: maps a classified intent to an application action. This is
 * deliberately NOT a chatbot — every intent resolves to a concrete app action, a
 * confirmation request, or a clarification request.
 */
import { extractLanguage } from "./slots";

export const NAV_ROUTES = {
  "nav.home": "/",
  "nav.countcam": "/countcam",
  "nav.result_verify": "/verify",
  "nav.polling_unit": "/polling-unit",
  "nav.incident": "/report",
  "nav.voteaccess": "/info",
  "nav.candidates": "/candidates",
  "nav.dashboard": "/dashboard",
  "nav.sync": "/sync",
  "nav.settings": "/settings",
};

const NOT_CLARIFIABLE = new Set(["unknown", "action.confirm", "action.cancel", "action.stop_speaking", "action.repeat"]);

/** Intents whose action has side effects and therefore needs a spoken/tapped "yes". */
export const SENSITIVE = new Set(["nav.sync"]);

/**
 * @param {object} c       classifier result
 * @param {string} text    the (possibly corrected) transcript
 * @param {object} ctx     { pendingConfirmation }
 * @returns {{type: string, ...}} an action descriptor (executed by the UI layer)
 */
export function route(c, text, ctx = {}) {
  // Answering a pending confirmation takes priority over everything else.
  if (ctx.pendingConfirmation) {
    if (c.intent === "action.confirm" && c.confident) return { type: "confirmed", action: ctx.pendingConfirmation };
    if (c.intent === "action.cancel" && c.confident) return { type: "cancelled" };
  }
  if (!c.confident) {
    // Offer only things the user can actually choose; yes/no/stop are meaningless as guesses.
    const options = [c.intent, ...c.alternatives.map((a) => a.label)].filter((i) => !NOT_CLARIFIABLE.has(i));
    return { type: "clarify", options: options.slice(0, 2) };
  }
  if (c.intent in NAV_ROUTES) {
    const action = { type: "navigate", path: NAV_ROUTES[c.intent], intent: c.intent };
    if (SENSITIVE.has(c.intent)) return { type: "confirm", action: { type: "sync_now", intent: c.intent }, promptKey: "voice.confirmSync" };
    return action;
  }
  switch (c.intent) {
    case "action.change_language": {
      const lang = extractLanguage(text);
      return lang ? { type: "set_language", lang } : { type: "navigate", path: "/settings", intent: c.intent };
    }
    case "action.go_back": return { type: "go_back" };
    case "action.read_aloud": return { type: "read_aloud" };
    case "action.repeat": return { type: "repeat" };
    case "action.help": return { type: "help" };
    case "action.stop_speaking": return { type: "stop_speaking" };
    case "action.confirm":
    case "action.cancel": return { type: "nothing_pending" };
    default: return { type: "out_of_scope" };
  }
}
