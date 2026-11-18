import { assessQuality, detectDocument, enhance, warpPerspective, warpSize } from "@/lib/image/analysis";
import { blobToImageData, imageDataToBlob } from "@/lib/image/canvas";

const DEFAULT_CORNERS = [{ x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 }];

/** Fast analysis on a downscaled copy: quality metrics + auto-detected corners (normalised). */
export async function analyse(blob) {
  const { image } = await blobToImageData(blob, 800);
  const quality = assessQuality(image);
  const quad = detectDocument(image);
  const corners = quad ? quad.map((p) => ({ x: p.x / image.width, y: p.y / image.height })) : DEFAULT_CORNERS;
  return { quality, corners, detected: !!quad };
}

/** Produce the cropped, perspective-corrected and enhanced copy. The original is untouched. */
export async function makeProcessed(blob, corners) {
  const { image } = await blobToImageData(blob, 2200);
  const quad = corners.map((c) => ({ x: c.x * (image.width - 1), y: c.y * (image.height - 1) }));
  const warped = warpPerspective(image, quad, warpSize(quad, 1800));
  return imageDataToBlob(enhance(warped), "image/jpeg", 0.88);
}
