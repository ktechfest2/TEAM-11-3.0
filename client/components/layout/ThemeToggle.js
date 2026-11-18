"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Briefly animate colours while the theme changes (skipped with reduced motion). */
export function applyTheme(updateSettings, theme) {
  const h = document.documentElement;
  h.classList.add("theme-switching");
  updateSettings({ theme });
  setTimeout(() => h.classList.remove("theme-switching"), 400);
}

/** One-tap light/dark switch for the header. Full choice (incl. "match phone") is in Settings. */
export default function ThemeToggle({ className = "" }) {
  const { t, settings, updateSettings } = useApp();
  const [sys, setSys] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSys(mq.matches);
    const h = (e) => setSys(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  const dark = settings.theme === "dark" || (settings.theme !== "light" && sys);
  const label = dark ? t("theme.toLight") : t("theme.toDark");
  return (
    <button type="button" onClick={() => applyTheme(updateSettings, dark ? "light" : "dark")} aria-label={label} title={label}
      className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface ring-1 ring-line transition hover:ring-brand active:scale-90 ${className}`}>
      <span className={`absolute transition duration-300 ${dark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`}><Icon name="moon" size={19} /></span>
      <span className={`absolute text-accent transition duration-300 ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`}><Icon name="sun" size={19} /></span>
    </button>
  );
}

export { systemDark };
