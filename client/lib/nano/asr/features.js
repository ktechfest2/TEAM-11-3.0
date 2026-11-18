/**
 * MFCC features + dynamic time warping, for closed-vocabulary voice commands in ANY language.
 *
 * AwaVote only needs to recognise ~20 short commands. For most Nigerian languages there is no
 * speech-recognition model at all, but a set of native-speaker recordings of each command is
 * enough to recognise them by template matching (nearest neighbours under DTW). This runs
 * fully on the device, is a few hundred KB per language, and needs no training step.
 *
 * The SAME code computes features on the contributor's phone (stored with each recording)
 * and on the user's phone at recognition time, so there is no cross-implementation drift.
 */
export const SAMPLE_RATE = 16000;
const FRAME = 400; // 25 ms
const HOP = 320; // 20 ms
const NFFT = 512;
const NMEL = 26;
export const NCEP = 13;

let melBank = null;
let hamming = null;

function hz2mel(f) { return 2595 * Math.log10(1 + f / 700); }
function mel2hz(m) { return 700 * (10 ** (m / 2595) - 1); }

function init() {
  if (melBank) return;
  hamming = Float32Array.from({ length: FRAME }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  const lo = hz2mel(60), hi = hz2mel(SAMPLE_RATE / 2);
  const pts = Array.from({ length: NMEL + 2 }, (_, i) => mel2hz(lo + ((hi - lo) * i) / (NMEL + 1)));
  const bins = pts.map((f) => Math.floor(((NFFT + 1) * f) / SAMPLE_RATE));
  melBank = [];
  for (let m = 1; m <= NMEL; m++) {
    const filt = new Float32Array(NFFT / 2 + 1);
    for (let k = bins[m - 1]; k < bins[m]; k++) filt[k] = (k - bins[m - 1]) / Math.max(1, bins[m] - bins[m - 1]);
    for (let k = bins[m]; k < bins[m + 1]; k++) filt[k] = (bins[m + 1] - k) / Math.max(1, bins[m + 1] - bins[m]);
    melBank.push(filt);
  }
}

/** In-place iterative radix-2 FFT. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/** Drop leading/trailing silence (frames below 10% of the peak frame energy). */
function trimSilence(pcm) {
  const n = Math.floor(pcm.length / HOP);
  const e = new Float32Array(n);
  for (let f = 0; f < n; f++) { let s = 0; for (let i = f * HOP; i < (f + 1) * HOP; i++) s += pcm[i] * pcm[i]; e[f] = s; }
  const peak = Math.max(...e, 1e-9);
  let a = 0, b = n - 1;
  while (a < n && e[a] < peak * 0.01) a++;
  while (b > a && e[b] < peak * 0.01) b--;
  return pcm.subarray(Math.max(0, (a - 3) * HOP), Math.min(pcm.length, (b + 4) * HOP));
}

/**
 * @param {Float32Array} pcm mono audio at 16 kHz
 * @returns {{frames: number, coeffs: number, data: number[]}} cepstral-mean-normalised MFCCs
 */
export function mfcc(pcm) {
  init();
  const x = trimSilence(pcm);
  const frames = Math.max(0, Math.floor((x.length - FRAME) / HOP) + 1);
  const out = new Float32Array(frames * NCEP);
  const re = new Float32Array(NFFT), im = new Float32Array(NFFT), logmel = new Float32Array(NMEL);
  for (let f = 0; f < frames; f++) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < FRAME; i++) {
      const s = x[f * HOP + i] - 0.97 * (f * HOP + i > 0 ? x[f * HOP + i - 1] : 0); // pre-emphasis
      re[i] = s * hamming[i];
    }
    fft(re, im);
    for (let m = 0; m < NMEL; m++) {
      let e = 0;
      const filt = melBank[m];
      for (let k = 0; k <= NFFT / 2; k++) if (filt[k]) e += filt[k] * (re[k] * re[k] + im[k] * im[k]);
      logmel[m] = Math.log(e + 1e-10);
    }
    for (let c = 0; c < NCEP; c++) {
      let s = 0;
      for (let m = 0; m < NMEL; m++) s += logmel[m] * Math.cos((Math.PI * c * (m + 0.5)) / NMEL);
      out[f * NCEP + c] = s;
    }
  }
  // Cepstral mean normalisation: removes microphone/channel differences between phones.
  for (let c = 0; c < NCEP; c++) {
    let mean = 0;
    for (let f = 0; f < frames; f++) mean += out[f * NCEP + c];
    mean /= frames || 1;
    for (let f = 0; f < frames; f++) out[f * NCEP + c] -= mean;
  }
  return { frames, coeffs: NCEP, data: Array.from(out, (v) => Math.round(v * 100) / 100) };
}

/** Length-normalised DTW distance with a Sakoe-Chiba band. Skips c0 (loudness). */
export function dtw(a, b) {
  const n = a.frames, m = b.frames, C = a.coeffs;
  if (!n || !m) return Infinity;
  const band = Math.max(Math.abs(n - m), Math.ceil(Math.max(n, m) * 0.25));
  let prev = new Float64Array(m + 1).fill(Infinity), cur = new Float64Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(Infinity);
    const lo = Math.max(1, i - band), hi = Math.min(m, i + band);
    for (let j = lo; j <= hi; j++) {
      let d = 0;
      for (let c = 1; c < C; c++) { const v = a.data[(i - 1) * C + c] - b.data[(j - 1) * C + c]; d += v * v; }
      cur[j] = Math.sqrt(d) + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m] / (n + m);
}

/**
 * k-nearest-template classification.
 * @param templates [{intent, features}]
 * @returns {{intent, confidence, alternatives: [{label, p}], distance}}
 */
export function classifyTemplates(query, templates, k = 5) {
  const scored = templates.map((t) => ({ intent: t.intent, d: dtw(query, t.features) })).sort((x, y) => x.d - y.d);
  if (!scored.length || !Number.isFinite(scored[0].d)) return { intent: null, confidence: 0, alternatives: [], distance: Infinity };
  const votes = new Map();
  for (const s of scored.slice(0, k)) votes.set(s.intent, (votes.get(s.intent) || 0) + 1 / (s.d + 1e-6));
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((acc, [, v]) => acc + v, 0);
  const best = ranked[0][0];
  // Margin between the best intent and the nearest template of any OTHER intent.
  const d1 = scored.find((s) => s.intent === best).d;
  const d2 = scored.find((s) => s.intent !== best)?.d ?? d1 * 2;
  const margin = Math.max(0, Math.min(1, (d2 - d1) / d2));
  return {
    intent: best,
    confidence: Math.min(1, (ranked[0][1] / total) * 0.6 + margin * 0.4 * 2.5),
    alternatives: ranked.slice(1, 4).map(([label, v]) => ({ label, p: v / total })),
    distance: d1,
  };
}
