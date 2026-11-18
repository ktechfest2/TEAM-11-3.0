"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Camera lifecycle with explicit permission/error states. The camera only runs while needed. */
export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | starting | live | denied | nocamera | insecure | error

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus((s) => (s === "live" || s === "starting" ? "idle" : s));
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext) return setStatus("insecure");
    if (!navigator.mediaDevices?.getUserMedia) return setStatus("nocamera");
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus("live");
    } catch (e) {
      setStatus(e.name === "NotAllowedError" || e.name === "SecurityError" ? "denied" : e.name === "NotFoundError" || e.name === "OverconstrainedError" ? "nocamera" : "error");
    }
  }, []);

  useEffect(() => stop, [stop]);
  // Release the camera if the user switches app/tab.
  useEffect(() => {
    const h = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [stop]);

  return { videoRef, streamRef, status, start, stop };
}
