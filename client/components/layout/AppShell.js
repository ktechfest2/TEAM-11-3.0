"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";
import VoicePanel from "@/components/voice/VoicePanel";
import ConnectivityBadge from "./ConnectivityBadge";

const TABS = [
  { href: "/", icon: "home", key: "nav.home" },
  { href: "/countcam", icon: "camera", key: "nav.countcam" },
  { href: "/report", icon: "alert", key: "nav.report" },
  { href: "/sync", icon: "upload", key: "nav.sync" },
  { href: "/settings", icon: "settings", key: "nav.settings" },
];

export default function AppShell({ children }) {
  const { t, sync } = useApp();
  const path = usePathname();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const attention = sync.failed + sync.conflict;

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded bg-brand px-3 py-2 text-brand-ink">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-xl" aria-label={`${t("app.name")} — ${t("nav.home")}`}>
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-ink"><Icon name="check" size={22} strokeWidth={3} /></span>
            <span>{t("app.name")}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ConnectivityBadge />
            <button type="button" onClick={() => setVoiceOpen(true)} aria-haspopup="dialog"
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-4 font-semibold text-brand-ink">
              <Icon name="mic" />
              <span className="hidden sm:inline">{t("home.voice.title")}</span>
              <span className="sr-only sm:hidden">{t("home.voice.title")}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        {children}
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map((tab) => {
            const active = tab.href === "/" ? path === "/" : path.startsWith(tab.href);
            return (
              <li key={tab.href}>
                <Link href={tab.href} aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs font-semibold leading-tight ${active ? "text-brand" : "text-muted"}`}>
                  <Icon name={tab.icon} />
                  <span className="line-clamp-2">{t(tab.key)}</span>
                  {tab.href === "/sync" && (sync.pending > 0 || attention > 0) && (
                    <span className={`absolute right-[22%] top-1.5 min-w-5 rounded-full px-1 text-[0.7rem] leading-5 text-white ${attention ? "bg-danger" : "bg-info"}`}>
                      {sync.pending + attention}
                      <span className="sr-only"> {t("status.pending", { n: sync.pending + attention })}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {voiceOpen && <VoicePanel onClose={() => setVoiceOpen(false)} />}
    </div>
  );
}
