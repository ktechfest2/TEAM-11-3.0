import { describe, expect, it } from "vitest";
import { classifyTemplates, dtw, mfcc, SAMPLE_RATE } from "@/lib/nano/asr/features";
import { encodeWav } from "@/lib/audio/wav";

// A "command" = sequence of [frequencyHz, durationS] syllables. A "speaker" shifts pitch,
// changes speed and adds noise + leading/trailing silence.
const COMMANDS = {
  "nav.countcam": [[300, 0.15], [700, 0.2], [450, 0.15]],
  "nav.incident": [[900, 0.25], [350, 0.25]],
  "nav.home": [[500, 0.1], [500, 0.1], [1200, 0.3]],
  "action.go_back": [[250, 0.4], [600, 0.1]],
};

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function say(syllables, { pitch = 1, speed = 1, noise = 0.02, seed = 1 } = {}) {
  const r = rng(seed);
  const parts = [new Float32Array(Math.floor(SAMPLE_RATE * 0.3))];
  for (const [f, d] of syllables) {
    const n = Math.floor(SAMPLE_RATE * d / speed);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const env = Math.sin((Math.PI * i) / n);
      const t = i / SAMPLE_RATE;
      s[i] = env * (0.5 * Math.sin(2 * Math.PI * f * pitch * t) + 0.25 * Math.sin(2 * Math.PI * 2 * f * pitch * t));
    }
    parts.push(s);
  }
  parts.push(new Float32Array(Math.floor(SAMPLE_RATE * 0.3)));
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  for (let i = 0; i < out.length; i++) out[i] += (r() - 0.5) * 2 * noise;
  return out;
}

const speakers = (n, base) => Array.from({ length: n }, (_, i) => ({ pitch: 0.9 + 0.05 * (i % 5), speed: 0.85 + 0.07 * (i % 4), noise: 0.01 + 0.005 * i, seed: base + i }));

describe("MFCC features", () => {
  it("produces normalised frames and trims silence", () => {
    const f = mfcc(say(COMMANDS["nav.home"]));
    expect(f.coeffs).toBe(13);
    expect(f.frames).toBeGreaterThan(20);
    expect(f.frames).toBeLessThan(40); // ~0.5 s of speech at 20 ms hop; the 0.6 s of silence is trimmed
    expect(f.data.length).toBe(f.frames * 13);
  });
  it("DTW: same command closer than different commands", () => {
    const a = mfcc(say(COMMANDS["nav.countcam"], { seed: 1 }));
    const b = mfcc(say(COMMANDS["nav.countcam"], { pitch: 1.05, speed: 1.1, seed: 2 }));
    const c = mfcc(say(COMMANDS["nav.incident"], { seed: 3 }));
    expect(dtw(a, b)).toBeLessThan(dtw(a, c));
  });
});

describe("template recogniser", () => {
  it("recognises commands from held-out speakers", () => {
    const templates = Object.entries(COMMANDS).flatMap(([intent, syl]) =>
      speakers(6, 10).map((sp) => ({ intent, features: mfcc(say(syl, sp)) })));
    let correct = 0, total = 0;
    for (const [intent, syl] of Object.entries(COMMANDS)) {
      for (const sp of speakers(5, 100)) { // different seeds = unseen "speakers"
        const r = classifyTemplates(mfcc(say(syl, sp)), templates);
        total++;
        if (r.intent === intent) correct++;
      }
    }
    expect(correct / total).toBeGreaterThanOrEqual(0.9);
  });
});

describe("WAV encoding", () => {
  it("writes a 16 kHz mono PCM16 header the server accepts", async () => {
    const buf = new DataView(await encodeWav(new Float32Array(1600)).arrayBuffer());
    expect(String.fromCharCode(...new Uint8Array(buf.buffer, 0, 4))).toBe("RIFF");
    expect(buf.getUint16(20, true)).toBe(1); // PCM
    expect(buf.getUint16(22, true)).toBe(1); // mono
    expect(buf.getUint32(24, true)).toBe(16000);
    expect(buf.getUint16(34, true)).toBe(16);
    expect(buf.byteLength).toBe(44 + 3200);
  });
});
