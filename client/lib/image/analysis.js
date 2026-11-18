/**
 * Lightweight, dependency-free image analysis for CountCam.
 * All functions take ImageData-like objects: { width, height, data: Uint8ClampedArray(RGBA) }.
 */

export function toGray({ width, height, data }) {
  const g = new Float32Array(width * height);
  for (let i = 0, p = 0; p < g.length; i += 4, p++) g[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return g;
}

/** Variance of the Laplacian: low values indicate a blurry image. */
export function laplacianVariance(gray, width, height) {
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v; sumSq += v * v; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Quality thresholds were tuned on ~1000px-wide frames of printed documents. They are
 * heuristics, not guarantees: users can always keep a photo the checker flags.
 */
export const QUALITY_THRESHOLDS = { blur: 60, dark: 60, bright: 225, lowContrast: 25, glare: 0.06 };

export function assessQuality(img) {
  const { width, height } = img;
  const gray = toGray(img);
  let sum = 0, sumSq = 0, glare = 0;
  for (const v of gray) { sum += v; sumSq += v * v; if (v >= 250) glare++; }
  const n = gray.length || 1;
  const brightness = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - brightness * brightness));
  const sharpness = laplacianVariance(gray, width, height);
  const t = QUALITY_THRESHOLDS;
  const issues = [];
  if (sharpness < t.blur) issues.push("blurry");
  if (brightness < t.dark) issues.push("too_dark");
  if (brightness > t.bright) issues.push("too_bright");
  if (contrast < t.lowContrast) issues.push("low_contrast");
  if (glare / n > t.glare) issues.push("glare");
  return {
    sharpness: Math.round(sharpness), brightness: Math.round(brightness), contrast: Math.round(contrast),
    glareRatio: +(glare / n).toFixed(3), issues, ok: issues.length === 0,
  };
}

/** Otsu's threshold on a grayscale buffer. */
export function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[Math.min(255, Math.max(0, v | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/**
 * Detect the result sheet as the largest bright region (paper is usually lighter than its
 * surroundings) and return its 4 corners [tl, tr, br, bl] in image coordinates, or null if
 * no convincing document was found. Users can always adjust the corners manually.
 */
export function detectDocument(img) {
  const { width, height } = img;
  const gray = toGray(img);
  const thr = otsu(gray);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i] > thr ? 1 : 0;

  // Largest 4-connected bright component (iterative flood fill).
  const label = new Int32Array(width * height);
  let bestLabel = 0, bestSize = 0, next = 1;
  const stack = new Int32Array(width * height);
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    let top = 0, size = 0;
    stack[top++] = s; label[s] = next;
    while (top) {
      const p = stack[--top]; size++;
      const x = p % width, y = (p / width) | 0;
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = next; stack[top++] = p - 1; }
      if (x < width - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = next; stack[top++] = p + 1; }
      if (y > 0 && mask[p - width] && !label[p - width]) { label[p - width] = next; stack[top++] = p - width; }
      if (y < height - 1 && mask[p + width] && !label[p + width]) { label[p + width] = next; stack[top++] = p + width; }
    }
    if (size > bestSize) { bestSize = size; bestLabel = next; }
    next++;
  }
  const area = width * height;
  if (bestSize < area * 0.15 || bestSize > area * 0.98) return null;

  // Extreme points along the diagonals give the four corners of a roughly convex quad.
  let tl, tr, br, bl;
  let minS = Infinity, maxS = -Infinity, minD = Infinity, maxD = -Infinity;
  for (let p = 0; p < label.length; p++) {
    if (label[p] !== bestLabel) continue;
    const x = p % width, y = (p / width) | 0;
    const s = x + y, d = x - y;
    if (s < minS) { minS = s; tl = { x, y }; }
    if (s > maxS) { maxS = s; br = { x, y }; }
    if (d > maxD) { maxD = d; tr = { x, y }; }
    if (d < minD) { minD = d; bl = { x, y }; }
  }
  const quad = [tl, tr, br, bl];
  return polygonArea(quad) >= area * 0.15 ? quad : null;
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size for a perspective-corrected quad, capped to maxSide. */
export function warpSize(quad, maxSide = 1600) {
  const [tl, tr, br, bl] = quad;
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Solve the 3x3 homography mapping src[i] -> dst[i] (4 point pairs). */
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [...h, 1];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) throw new Error("Degenerate corner points");
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Perspective-correct `quad` of `src` into a new ImageData-like of `size` (bilinear sampling). */
export function warpPerspective(src, quad, size = warpSize(quad)) {
  const { width: W, height: H } = size;
  const dstPts = [{ x: 0, y: 0 }, { x: W - 1, y: 0 }, { x: W - 1, y: H - 1 }, { x: 0, y: H - 1 }];
  const h = homography(dstPts, quad); // maps output pixel -> source pixel
  const out = new Uint8ClampedArray(W * H * 4);
  const sw = src.width, sh = src.height, sd = src.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = h[6] * x + h[7] * y + h[8];
      const sx = (h[0] * x + h[1] * y + h[2]) / z;
      const sy = (h[3] * x + h[4] * y + h[5]) / z;
      const o = (y * W + x) * 4;
      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) { out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = 255; continue; }
      const x0 = sx | 0, y0 = sy | 0, x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
      const fx = sx - x0, fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const a = sd[(y0 * sw + x0) * 4 + c], b = sd[(y0 * sw + x1) * 4 + c];
        const d = sd[(y1 * sw + x0) * 4 + c], e = sd[(y1 * sw + x1) * 4 + c];
        out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { width: W, height: H, data: out };
}

/** Auto-levels (2nd-98th percentile stretch on luminance) for readability. Returns a new image. */
export function enhance(img) {
  const gray = toGray(img);
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v | 0]++;
  const n = gray.length;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
  const scale = hi > lo ? 255 / (hi - lo) : 1;
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    out[i] = (img.data[i] - lo) * scale;
    out[i + 1] = (img.data[i + 1] - lo) * scale;
    out[i + 2] = (img.data[i + 2] - lo) * scale;
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}
