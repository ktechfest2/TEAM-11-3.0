/**
 * Speech-to-text interface. Each provider implements:
 *   listen({ lang, signal, onLevel, onState }) -> Promise<{ text, confidence|null, provider, offline, latencyMs }>
 *   supports(lang) -> boolean
 * Providers are independent and replaceable (e.g. by a Nigerian-language fine-tuned model).
 */
import { releaseRecognizer, transcribe as transcribeWith } from "../speech";
import { hasSpeech, recordUtterance } from "./recorder";
import { classifyTemplates, mfcc } from "./features";
import { getPack } from "../voicepack";

/**
 * On-device Whisper-family recogniser (N-ATLaS when hosted, else Whisper-tiny), chosen and
 * set up automatically by ../speech.js.
 */
export function speechLocal(choice) {
  return {
    id: choice.natlas ? "natlas-local" : "whisper-local", offline: true,
    async listen({ signal, onLevel, onState }) {
      onState?.("listening");
      const pcm = await recordUtterance({ onLevel, signal });
      if (!hasSpeech(pcm)) return { text: "", confidence: null, provider: this.id, offline: true, latencyMs: 0, noSpeech: true };
      onState?.("transcribing");
      const t0 = performance.now();
      const out = await transcribeWith(choice, pcm);
      // Whisper exposes no calibrated confidence via Transformers.js; intent confidence gates actions.
      return { text: (out.text || "").trim(), confidence: null, provider: this.id, model: choice.name, offline: true,
        latencyMs: Math.round(performance.now() - t0) };
    },
    release: releaseRecognizer,
  };
}

/**
 * Browser speech recognition. In Chrome this sends audio to an ONLINE Google service, so
 * it is off by default and only used if the user explicitly opts in. Never used offline.
 */
const BCP47 = { en: "en-NG", pcm: "en-NG", yo: "yo-NG", ha: "ha-NG", ig: "ig-NG" };

export const webSpeechOnline = {
  id: "webspeech-online", offline: false,
  available: () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  supports: (lang) => lang in BCP47,
  listen({ lang, signal, onState }) {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new SR();
      r.lang = BCP47[lang];
      r.interimResults = false;
      r.maxAlternatives = 1;
      const t0 = performance.now();
      let done = false;
      r.onresult = (e) => {
        done = true;
        const alt = e.results[0][0];
        resolve({ text: alt.transcript.trim(), confidence: alt.confidence ?? null, provider: this.id, offline: false, latencyMs: Math.round(performance.now() - t0) });
      };
      r.onerror = (e) => { done = true; reject(new Error(e.error || "speech-error")); };
      r.onend = () => { if (!done) resolve({ text: "", confidence: null, provider: this.id, offline: false, latencyMs: 0, noSpeech: true }); };
      signal?.addEventListener("abort", () => r.abort(), { once: true });
      onState?.("listening");
      r.start();
    });
  },
  async release() {},
};

/**
 * Native-speaker command templates (any language with an installed voice pack). Returns an
 * intent directly instead of text: it only knows the app's commands, which is all AwaVote needs.
 */
export const templatesLocal = {
  id: "templates-local", offline: true,
  async listen({ lang, signal, onLevel, onState }) {
    const pack = await getPack(lang);
    if (!pack?.commands?.length) throw new Error("No voice pack for this language");
    onState?.("listening");
    const pcm = await recordUtterance({ onLevel, signal });
    if (!hasSpeech(pcm)) return { text: "", intent: null, confidence: null, provider: this.id, offline: true, latencyMs: 0, noSpeech: true };
    onState?.("transcribing");
    const t0 = performance.now();
    const r = classifyTemplates(mfcc(pcm), pack.commands);
    return { text: "", intent: r.intent, confidence: r.confidence, alternatives: r.alternatives, packVersion: pack.version,
      provider: this.id, offline: true, latencyMs: Math.round(performance.now() - t0) };
  },
  async release() {},
};

/**
 * Pick a provider: the automatically-installed speech model first, then native-speaker
 * command templates (any language), then the browser's online service only if opted in.
 */
export function selectRecognizer({ allowOnline, speech, templatePack }) {
  if (speech?.status === "ready" && speech.model) return speechLocal(speech.model);
  if (templatePack) return templatesLocal;
  if (allowOnline && navigator.onLine && webSpeechOnline.available()) return webSpeechOnline;
  return null;
}

/**
 * Transcribe an already-captured phrase (hands-free mode) in `lang`, using the best recogniser
 * available ON THE PHONE right now:
 *   1. that language's N-ATLaS model if it is downloaded,
 *   2. else Whisper-tiny (bundled with the app) for English/Pidgin/Yoruba/Hausa,
 *   3. else the native-speaker command templates for that language.
 * If the N-ATLaS model is missing it starts downloading in the background for next time.
 * @returns {Promise<{text, intent?, confidence, provider, model?, offline, latencyMs, lang} | null>}
 */
export async function transcribeIn(lang, pcm, { allowDownload = true, full = false } = {}) {
  const sp = await import("../speech");
  const catalog = await sp.getCatalog();
  const best = sp.chooseModel(lang, catalog);
  const t0 = performance.now();
  let choice = null;
  if (best && await sp.isModelCached(best)) choice = best;
  else {
    if (best?.host === "awavote" && allowDownload && navigator.onLine) sp.prefetchModel(best).catch(() => {});
    const tiny = sp.chooseModel(lang, { models: [] }); // Whisper-tiny entry for en/pcm/yo/ha, else null
    if (tiny && await sp.isModelCached(tiny)) choice = tiny;
    else if (tiny && navigator.onLine) choice = tiny; // bundled with the app: loads from our own server
  }
  if (choice) {
    const out = await sp.transcribe(choice, pcm, { full });
    return { text: out.text, confidence: null, provider: choice.natlas ? "natlas-local" : "whisper-local",
      model: choice.name, offline: true, latencyMs: Math.round(performance.now() - t0), lang, shortWindow: out.short };
  }
  const pack = await getPack(lang);
  if (pack?.commands?.length) {
    const r = classifyTemplates(mfcc(pcm), pack.commands);
    return { text: "", intent: r.intent, confidence: r.confidence, alternatives: r.alternatives, provider: "templates-local",
      offline: true, latencyMs: Math.round(performance.now() - t0), lang };
  }
  return null;
}
