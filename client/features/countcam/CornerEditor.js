"use client";
import { useRef } from "react";

/**
 * Shows an image with four draggable corner handles. Corners are normalised (0..1).
 * Handles are real buttons: drag with touch/mouse, or focus and use arrow keys
 * (Shift = bigger steps), so the editor works with keyboards and switch devices.
 */
const NAMES = ["Top left corner", "Top right corner", "Bottom right corner", "Bottom left corner"];

export default function CornerEditor({ src, corners, onChange, label }) {
  const box = useRef(null);
  const drag = useRef(null);

  const move = (i, x, y) => {
    const next = corners.map((c, j) => (j === i ? { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } : c));
    onChange(next);
  };
  const onPointerMove = (e) => {
    if (drag.current === null) return;
    const r = box.current.getBoundingClientRect();
    move(drag.current, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  const onKey = (i, e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    move(i, corners[i].x + d[0], corners[i].y + d[1]);
  };
  const pts = corners.map((c) => `${c.x * 100},${c.y * 100}`).join(" ");

  return (
    <div ref={box} className="relative w-full touch-none select-none overflow-hidden rounded-xl bg-black"
      onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className="block w-full" draggable={false} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polygon points={pts} fill="rgba(60,207,142,0.18)" stroke="#3ccf8e" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      </svg>
      {corners.map((c, i) => (
        <button key={i} type="button" aria-label={`${NAMES[i]} (use arrow keys to move)`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = i; }}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={(e) => onKey(i, e)}
          className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[#0b6b47]/80 shadow-lg"
          style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }} />
      ))}
    </div>
  );
}
