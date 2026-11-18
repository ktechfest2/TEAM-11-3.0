/** Browser-only helpers bridging Blobs/video frames and ImageData. */

export async function blobToImageData(blob, maxSide = Infinity) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const canvas = new OffscreenCanvasOrCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { image: ctx.getImageData(0, 0, w, h), scale: k };
}

function OffscreenCanvasOrCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

export async function imageDataToBlob(img, type = "image/jpeg", quality = 0.9) {
  const canvas = new OffscreenCanvasOrCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(img instanceof ImageData ? img : new ImageData(img.data, img.width, img.height), 0, 0);
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((res) => canvas.toBlob(res, type, quality));
}

/**
 * Grab a full-resolution still. Prefers ImageCapture.takePhoto() (the camera's own JPEG,
 * often higher resolution than the preview stream); falls back to drawing the video frame.
 */
export async function captureStill(video, stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (track && typeof ImageCapture !== "undefined") {
    try {
      return await new ImageCapture(track).takePhoto();
    } catch { /* fall through */ }
  }
  const c = document.createElement("canvas");
  c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.95));
}
