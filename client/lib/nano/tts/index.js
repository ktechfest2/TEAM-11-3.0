/**
 * Text-to-speech interface with independent providers, tried in order:
 *   1. prerecorded  — human recordings of frequent prompts (public/audio/<lang>/<key>.mp3)
 *   2. mms-local    — on-device MMS-TTS voice pack (Yoruba only for now; opt-in, CC-BY-NC)
 *   3. device       — the OS speech synthesiser (offline on most phones, but rarely has
 *                     Yoruba/Hausa/Igbo voices)
 * If none can speak the language, speak() resolves { spoken: false, reason } and the UI
 * keeps showing the text — we never read Yoruba text with an English voice silently.
 */
import { getTransformers } from "../transformers";
import { getPromptAudio } from "../voicepack";

const BCP47 = { en: ["en-NG", "en-GB", "en"], pcm: ["en-NG", "en-GB", "en"], yo: ["yo"], ha: ["ha"], ig: ["ig"] };

let current = null; // { stop, pause, resume }
let last = null;    // last {text, opts} for replay
let manifest; // lazy-loaded prerecorded manifest

async function loadManifest() {
  if (manifest !== undefined) return manifest;
  try { manifest = await (await fetch("/audio/manifest.json")).json(); } catch { manifest = {}; }
  return manifest;
}

/** Chrome loads voices asynchronously; wait (max 1.5 s) for the list on first use. */
function voicesReady() {
  if (typeof speechSynthesis === "undefined" || speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { speechSynthesis.removeEventListener("voiceschanged", done); res(); };
    speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, 1500);
  });
}

export function deviceVoiceFor(lang) {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices();
  for (const tag of BCP47[lang] || []) {
    const v = voices.find((x) => x.lang.toLowerCase().replace("_", "-").startsWith(tag.toLowerCase()));
    if (v) return v;
  }
  return null;
}

function playAudio(src, rate) {
  const a = new Audio(src);
  a.playbackRate = rate;
  const done = new Promise((res, rej) => { a.onended = () => res(); a.onerror = () => rej(new Error("audio")); });
  a.play();
  current = { stop: () => { a.pause(); a.currentTime = 0; }, pause: () => a.pause(), resume: () => a.play() };
  return done;
}

let mmsYor = null;
async function mmsSpeak(text, rate) {
  if (!mmsYor) {
    const { pipeline } = await getTransformers();
    mmsYor = await pipeline("text-to-speech", "Xenova/mms-tts-yor", { dtype: "q8", device: "wasm" });
  }
  const out = await mmsYor(text);
  const ctx = new AudioContext();
  const buf = ctx.createBuffer(1, out.audio.length, out.sampling_rate);
  buf.copyToChannel(out.audio, 0);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.playbackRate.value = rate;
  node.connect(ctx.destination);
  const done = new Promise((res) => (node.onended = () => { ctx.close(); res(); }));
  node.start();
  current = { stop: () => { try { node.stop(); } catch {} }, pause: () => ctx.suspend(), resume: () => ctx.resume() };
  return done;
}

/**
 * @param {string} text
 * @param {{lang: string, rate?: number, key?: string, mmsEnabled?: boolean}} opts
 */
export async function speak(text, opts) {
  stop();
  const { lang, rate = 1, key, mmsEnabled = false } = opts;
  last = { text, opts };
  if (!text) return { spoken: false, reason: "empty" };

  // 1. Native-speaker recording of this exact prompt (from the language's voice pack).
  const recorded = await getPromptAudio(lang, key).catch(() => null);
  if (recorded) {
    const url = URL.createObjectURL(recorded);
    await playAudio(url, rate).catch(() => {});
    URL.revokeObjectURL(url);
    return { spoken: true, provider: "native-recording" };
  }
  const m = await loadManifest();
  if (key && m?.[lang]?.[key]) {
    await playAudio(`/audio/${lang}/${m[lang][key]}`, rate).catch(() => {});
    return { spoken: true, provider: "prerecorded" };
  }
  if (lang === "yo" && mmsEnabled) {
    try {
      await mmsSpeak(text, rate);
      return { spoken: true, provider: "mms-local" };
    } catch { /* fall through to device voice */ }
  }
  await voicesReady();
  const voice = deviceVoiceFor(lang);
  if (!voice) return { spoken: false, reason: "no_voice" };
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    u.onend = u.onerror = () => resolve();
    current = { stop: () => speechSynthesis.cancel(), pause: () => speechSynthesis.pause(), resume: () => speechSynthesis.resume() };
    speechSynthesis.speak(u);
  });
  return { spoken: true, provider: "device" };
}

export function stop() { current?.stop(); current = null; }
export function pause() { current?.pause(); }
export function resume() { current?.resume(); }
export function replay() { return last ? speak(last.text, last.opts) : Promise.resolve({ spoken: false, reason: "nothing" }); }

export async function releaseTTS() {
  stop();
  await mmsYor?.dispose?.();
  mmsYor = null;
}
