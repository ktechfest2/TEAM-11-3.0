import { describe, expect, it } from "vitest";
import { assessQuality, detectDocument, homography, warpPerspective } from "@/lib/image/analysis";

function img(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = fn(x, y), i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}
const inside = (px, py, poly) => {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
};

describe("image quality", () => {
  it("flags a featureless image as blurry and a detailed one as sharp", () => {
    expect(assessQuality(img(120, 120, () => 128)).issues).toContain("blurry");
    const sharp = assessQuality(img(120, 120, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? 230 : 30)));
    expect(sharp.issues).not.toContain("blurry");
  });
  it("flags dark images", () => {
    expect(assessQuality(img(50, 50, (x) => (x % 2 ? 20 : 10))).issues).toContain("too_dark");
  });
});

describe("document detection + perspective", () => {
  it("finds the corners of a bright tilted sheet on a dark background", () => {
    const poly = [[60, 30], [250, 50], [235, 280], [40, 260]];
    const q = detectDocument(img(300, 300, (x, y) => (inside(x, y, poly) ? 235 : 40)));
    expect(q).not.toBeNull();
    q.forEach((p, i) => {
      expect(Math.abs(p.x - poly[i][0])).toBeLessThan(6);
      expect(Math.abs(p.y - poly[i][1])).toBeLessThan(6);
    });
  });
  it("returns null when there is no document-like region", () => {
    expect(detectDocument(img(100, 100, () => 120))).toBeNull();
  });
  it("homography maps the four reference points exactly", () => {
    const src = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const dst = [{ x: 3, y: 1 }, { x: 20, y: 4 }, { x: 18, y: 25 }, { x: 1, y: 22 }];
    const h = homography(src, dst);
    src.forEach((p, i) => {
      const z = h[6] * p.x + h[7] * p.y + h[8];
      expect((h[0] * p.x + h[1] * p.y + h[2]) / z).toBeCloseTo(dst[i].x, 6);
      expect((h[3] * p.x + h[4] * p.y + h[5]) / z).toBeCloseTo(dst[i].y, 6);
    });
  });
  it("warps a region into an upright image of the requested size", () => {
    const src = img(100, 100, (x) => (x < 50 ? 0 : 255));
    const out = warpPerspective(src, [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }], { width: 40, height: 40 });
    expect(out.width).toBe(40);
    expect(out.data[(20 * 40 + 2) * 4]).toBe(0);    // left half dark
    expect(out.data[(20 * 40 + 37) * 4]).toBe(255); // right half bright
  });
});
