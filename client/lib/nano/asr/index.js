/**
 * Speech-to-text interface. Each provider implements:
 *   listen({ lang, signal, onLevel, onState }) -> Promise<{ text, confidence|null, provider, offline, latencyMs }>
 *   supports(lang) -> boolean
 * Providers are independent and replaceable (e.g. by a Nigerian-language fine-tuned model).
 */
import { getTransformers } from "../transformers";
import { hasSpeech, recordUtterance } from "./recorder";
import { classifyTemplates, mfcc } from "./features";
import { getPack } from "../voicepack";

const WHISPER_LANG = { en: "english", pcm: "english", yo: "yoruba", ha: "hausa" }; // no Igbo in Whisper

let whisper = null;

export const whisperLocal = {
  id: "whisper-local", offline: true, packId: "asr-whisper-tiny",
  supports: (lang) => lang in WHISPER_LANG,
  async load(onProgress) {
    if (whisper) return whisper;
    const { pipeline } = await getTransformers();
    whisper = await pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny", {
      dtype: "q8", device: "wasm", progress_callback: onProgress,
    });
    return whisper;
  },
  async listen({ lang, signal, onLevel, onState }) {
    onState?.("loading");
    const asr = await this.load();
    onState?.("listening");
    const pcm = await recordUtterance({ onLevel, signal });
    if (!hasSpeech(pcm)) return { text: "", confidence: null, provider: this.id, offline: true, latencyMs: 0, noSpeech: true };
    onState?.("transcribing");
    const t0 = performance.now();
    const out = await asr(pcm, { language: WHISPER_LANG[lang] ?? "english", task: "transcribe", chunk_length_s: 30 });
    // Whisper (via Transformers.js) exposes no calibrated confidence; downstream intent confidence gates actions.
    return { text: (out.text || "").trim(), confidence: null, provider: this.id, offline: true, latencyMs: Math.round(performance.now() - t0) };
  },
  async release() {
    await whisper?.dispose?.();
    whisper = null;
  },
};

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
 * Pick a provider: native-speaker templates for the language first (closed vocabulary, works
 * for any language), then the offline Whisper pack, then the online one only if opted in.
 */
export function selectRecognizer({ lang, allowOnline, whisperInstalled, templatePack }) {
  if (templatePack) return templatesLocal;
  if (whisperInstalled && whisperLocal.supports(lang)) return whisperLocal;
  if (allowOnline && navigator.onLine && webSpeechOnline.available()) return webSpeechOnline;
  return null;
}
