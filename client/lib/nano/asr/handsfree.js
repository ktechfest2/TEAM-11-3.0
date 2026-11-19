/**
 * Hands-free listening: the microphone stays open while AwaVote is on screen, and the app
 * wakes up when someone starts speaking — no button. Each spoken phrase is cut out with
 * voice activity detection (VAD) and handed to the command pipeline.
 *
 * Privacy / battery:
 * - Audio never leaves the phone; nothing is recorded or stored, phrases are processed and dropped.
 * - Listening stops whenever the app is hidden (another app, screen off) and resumes on return.
 * - It pauses while AwaVote itself is talking (so it never hears its own voice) and while a
 *   phrase is being processed.
 *
 * VAD: 20 ms frames; an adaptive noise floor follows the room; a phrase starts after
 * >= 180 ms of speech-like energy in a 300 ms window, keeps 400 ms of audio before that
 * (so the first syllable is not cut), and ends after `silenceMs` of quiet or `maxMs`.
 */
import { resample } from "./recorder";

const RATE = 16000;
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("awavote-handsfree", Tap);`;

export class HandsFreeListener extends EventTarget {
  constructor({ silenceMs = 800, maxMs = 8000, minSpeechMs = 300 } = {}) {
    super();
    Object.assign(this, { silenceMs, maxMs, minSpeechMs });
    this.state = "off"; // off | starting | needs-gesture | denied | listening | hearing | paused | error
    this.paused = false;
    this.stream = this.ctx = null;
    this.onVisibility = () => (document.hidden ? this.#suspend() : this.#wake());
  }

  #set(state, extra = {}) {
    if (this.state === state && !Object.keys(extra).length) return;
    this.state = state;
    this.dispatchEvent(new CustomEvent("state", { detail: { state, ...extra } }));
  }

  /** Open the microphone. Safe to call repeatedly. Resolves to the resulting state. */
  async start() {
    if (this.stream && this.ctx) { await this.#wake(); return this.state; }
    this.#set("starting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      });
    } catch (e) {
      this.#set(e.name === "NotAllowedError" || e.name === "SecurityError" ? "denied" : "error", { message: e.message });
      return this.state;
    }
    this.ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 100;
    this.tap = new AudioWorkletNode(this.ctx, "awavote-handsfree");
    src.connect(hp).connect(this.tap);
    this.#resetVad();
    this.tap.port.onmessage = ({ data }) => this.#onSamples(data);
    document.addEventListener("visibilitychange", this.onVisibility);
    await this.#wake();
    return this.state;
  }

  /** Browsers only let audio start after the user has touched the page once. */
  async #wake() {
    if (!this.ctx || document.hidden) return;
    if (this.ctx.state !== "running") {
      await this.ctx.resume().catch(() => {});
      if (this.ctx.state !== "running") {
        this.#set("needs-gesture");
        const go = () => { window.removeEventListener("pointerdown", go, true); window.removeEventListener("keydown", go, true); this.#wake(); };
        window.addEventListener("pointerdown", go, true);
        window.addEventListener("keydown", go, true);
        return;
      }
    }
    this.#resetVad();
    this.#set(this.paused ? "paused" : "listening");
  }

  async #suspend() {
    if (this.ctx?.state === "running") await this.ctx.suspend().catch(() => {});
    this.#resetVad();
    if (this.state !== "off") this.#set("paused");
  }

  /** Stop hearing phrases (e.g. while AwaVote speaks or works); the mic stays ready. */
  pause() { this.paused = true; this.#resetVad(); if (this.state === "listening" || this.state === "hearing") this.#set("paused"); }
  resume() { this.paused = false; this.#resetVad(); if (this.state === "paused" && !document.hidden && this.ctx?.state === "running") this.#set("listening"); }

  /** Close the microphone completely. */
  async stop() {
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.tap) this.tap.port.onmessage = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
    this.stream = this.ctx = this.tap = null;
    this.#set("off");
  }

  #resetVad() {
    this.frame = [];
    this.pre = [];          // ring of recent 20 ms frames (pre-roll)
    this.voicedWin = [];    // last 15 frame decisions (300 ms)
    this.utt = null;        // frames of the phrase being captured
    this.silent = 0;
    this.noise ??= 0.004;
  }

  #onSamples(data) {
    if (this.paused || !this.ctx) return;
    const per = Math.round(this.ctx.sampleRate * 0.02);
    for (const v of data) {
      this.frame.push(v);
      if (this.frame.length >= per) { this.#onFrame(Float32Array.from(this.frame)); this.frame = []; }
    }
  }

  #onFrame(f) {
    let s = 0;
    for (const v of f) s += v * v;
    const rms = Math.sqrt(s / f.length);
    const voiced = rms > Math.max(this.noise * 3, 0.012);
    if (!voiced && !this.utt) this.noise = this.noise * 0.95 + rms * 0.05; // follow the room while quiet
    this.dispatchEvent(new CustomEvent("level", { detail: { level: Math.min(1, rms * 8) } }));
    this.voicedWin.push(voiced);
    if (this.voicedWin.length > 15) this.voicedWin.shift();

    if (!this.utt) {
      this.pre.push(f);
      if (this.pre.length > 20) this.pre.shift();
      if (this.voicedWin.filter(Boolean).length >= 9) { // >= 180 ms of speech in the last 300 ms
        this.utt = [...this.pre];
        this.voicedFrames = 9;
        this.silent = 0;
        this.#set("hearing");
      }
      return;
    }
    this.utt.push(f);
    if (voiced) { this.voicedFrames++; this.silent = 0; } else this.silent++;
    const ms = this.utt.length * 20;
    if (this.silent * 20 >= this.silenceMs || ms >= this.maxMs) {
      const frames = this.utt;
      const enough = this.voicedFrames * 20 >= this.minSpeechMs;
      this.utt = null;
      this.pre = [];
      this.voicedWin = [];
      this.#set(this.paused ? "paused" : "listening");
      if (!enough) return; // a cough or a door: ignore
      const total = frames.reduce((n, x) => n + x.length, 0);
      const pcm = new Float32Array(total);
      let o = 0;
      for (const x of frames) { pcm.set(x, o); o += x.length; }
      this.dispatchEvent(new CustomEvent("utterance", { detail: { pcm: resample(pcm, this.ctx.sampleRate, RATE), ms } }));
    }
  }
}
