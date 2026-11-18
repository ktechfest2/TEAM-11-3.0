/**
 * Local OCR with Tesseract.js. Worker, WASM core and language data are all served from
 * /tesseract/ (copied at install time) so OCR works fully offline. Loaded only on demand,
 * and the worker is terminated after each job to free memory.
 */
export async function recognise(blob, onProgress) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    langPath: "/tesseract/lang",
    gzip: true,
    workerBlobURL: false,
    logger: (m) => m.status === "recognizing text" && onProgress?.(Math.round(m.progress * 100)),
  });
  try {
    const { data } = await worker.recognize(blob);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}
