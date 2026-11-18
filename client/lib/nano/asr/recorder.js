/**
 * Microphone capture with energy-based voice activity detection (VAD) and endpointing.
 * Runs only while the user is actively giving a command — never continuously.
 *
 * - Calibrates the background-noise floor over the first ~300 ms, then treats audio as
 *   speech when its RMS exceeds max(noise * 3, 0.012).
 * - Ends the utterance after `silenceMs` of silence following speech (endpoint detection),
 *   after `maxMs`, or after `noSpeechMs` with no speech at all.
 * - Uses the browser's noise suppression / echo cancellation and a 100 Hz high-pass filter.
 * Returns mono Float32 PCM resampled to 16 kHz (what Whisper-class models expect).
 */
const TARGET_RATE = 16000;

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("awavote-tap", Tap);`;

export async function recordUtterance({ onLevel, onSpeechStart, signal, silenceMs = 900, maxMs = 8000, noSpeechMs = 5000 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  const chunks = [];
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 100;
    const tap = new AudioWorkletNode(ctx, "awavote-tap");
    src.connect(hp).connect(tap);

    await new Promise((resolve, reject) => {
      const start = performance.now();
      let noise = 0, noiseFrames = 0, speechAt = null, lastVoice = 0;
      const finish = () => { tap.port.onmessage = null; resolve(); };
      signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
      tap.port.onmessage = ({ data }) => {
        chunks.push(data);
        let s = 0;
        for (const v of data) s += v * v;
        const rms = Math.sqrt(s / data.length);
        const t = performance.now() - start;
        onLevel?.(Math.min(1, rms * 8));
        if (t < 300) { noise += rms; noiseFrames++; return; }
        const floor = noiseFrames ? noise / noiseFrames : 0.005;
        if (rms > Math.max(floor * 3, 0.012)) {
          if (speechAt === null) { speechAt = t; onSpeechStart?.(); }
          lastVoice = t;
        }
        if (speechAt !== null && t - lastVoice > silenceMs) return finish();
        if (t > maxMs) return finish();
        if (speechAt === null && t > noSpeechMs) return finish();
      };
    });
  } finally {
    stream.getTracks().forEach((tr) => tr.stop());
    await ctx.close();
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const pcm = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { pcm.set(c, o); o += c.length; }
  return resample(pcm, ctx.sampleRate, TARGET_RATE);
}

/** Linear resampler (adequate for speech recognition input). */
export function resample(pcm, from, to) {
  if (from === to) return pcm;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(pcm.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio, x0 = Math.floor(x), x1 = Math.min(x0 + 1, pcm.length - 1);
    out[i] = pcm[x0] + (pcm[x1] - pcm[x0]) * (x - x0);
  }
  return out;
}

/** True if the clip contains anything louder than the noise gate (avoids Whisper "hallucinating" on silence). */
export function hasSpeech(pcm, gate = 0.015) {
  const frame = 320;
  let voiced = 0;
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let s = 0;
    for (let j = i; j < i + frame; j++) s += pcm[j] * pcm[j];
    if (Math.sqrt(s / frame) > gate) voiced++;
  }
  return voiced >= 8; // >= ~160 ms of voiced audio
}
