"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";
import VoicePanel from "@/components/voice/VoicePanel";
import ConnectivityBadge from "./ConnectivityBadge";
import ThemeToggle from "./ThemeToggle";
import Logo from "./Logo";
import { NAV_GROUPS, isActive } from "./nav";
import { LANGUAGES } from "@/lib/i18n/languages";

function Badge({ n, danger }) {
  if (!n) return null;
  return (
    <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.7rem] font-bold leading-none text-white ${danger ? "bg-danger" : "bg-info"}`}>{n}</span>
  );
}

/** Full-height list of every destination (desktop sidebar + mobile menu sheet). */
function NavList({ path, onNavigate }) {
  const { t, sync } = useApp();
  const attention = sync.failed + sync.conflict;
  return (
    <div className="flex flex-col gap-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.key}>
          <p className="mb-1.5 px-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">{t(g.key)}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const active = isActive(path, it.href);
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 font-semibold transition ${active ? "bg-brand-soft text-brand" : "hover:bg-surface-2"}`}>
                    <Icon name={it.icon} size={22} />
                    <span className="flex-1">{t(it.key)}</span>
                    {it.badge === "sync" && <Badge n={sync.pending + attention} danger={attention > 0} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function MenuSheet({ onClose }) {
  const { t } = useApp();
  const path = usePathname();
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => e.target === ref.current && onClose()}
      aria-label={t("nav.menu")}
      className="mx-auto mb-0 mt-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink">
      <div className="flex items-center justify-between px-2 pb-3">
        <p className="font-display text-xl font-bold">{t("nav.menu")}</p>
        <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-surface-2" aria-label={t("common.close")}><Icon name="x" /></button>
      </div>
      <NavList path={path} onNavigate={onClose} />
    </dialog>
  );
}

export default function AppShell({ children }) {
  const { t, sync, settings } = useApp();
  const path = usePathname();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const attention = sync.failed + sync.conflict;
  const lang = LANGUAGES.find((l) => l.code === settings.language);

  const tab = (href, icon, key, extra) => {
    const active = isActive(path, href);
    return (
      <Link href={href} aria-current={active ? "page" : undefined}
        className={`group flex min-h-16 flex-col items-center justify-center gap-1 text-[0.72rem] font-semibold leading-none ${active ? "text-brand" : "text-muted"}`}>
        <span className={`grid h-8 w-14 place-items-center rounded-full transition ${active ? "bg-brand-soft" : "group-hover:bg-surface-2"}`}><Icon name={icon} size={22} /></span>
        <span className="max-w-[5.5rem] truncate">{t(key)}</span>
        {extra}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded-xl bg-brand px-3 py-2 text-brand-ink">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-4 py-5 lg:flex">
        <Link href="/" className="px-2" aria-label={`AwaVote — ${t("nav.home")}`}><Logo /></Link>
        <button type="button" onClick={() => setVoiceOpen(true)} aria-haspopup="dialog"
          className="flex min-h-14 items-center gap-3 rounded-2xl bg-brand px-4 font-semibold text-brand-ink transition active:scale-[0.98]">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-ink"><Icon name="mic" size={20} /></span>
          {t("home.voice.title")}
        </button>
        <Link href="/" aria-current={path === "/" ? "page" : undefined}
          className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 font-semibold ${path === "/" ? "bg-brand-soft text-brand" : "hover:bg-surface-2"}`}>
          <Icon name="home" size={22} /> {t("nav.home")}
        </Link>
        <NavList path={path} />
        <div className="mt-auto flex flex-wrap items-center gap-2 px-2"><ConnectivityBadge /><ThemeToggle /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile / tablet header */}
        <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2.5 min-[360px]:px-4">
            <Link href="/" aria-label={`AwaVote — ${t("nav.home")}`}><Logo size={34} /></Link>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <ConnectivityBadge compact />
              <ThemeToggle />
              <Link href="/settings" className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-full bg-surface px-2.5 text-sm font-semibold ring-1 ring-line" aria-label={`${t("settings.language")}: ${lang?.native}`}>
                <Icon name="globe" size={18} /> <span className="hidden max-w-[6rem] truncate min-[400px]:inline">{lang?.native}</span>
              </Link>
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 pb-32 pt-4 outline-none lg:max-w-4xl lg:px-10 lg:pb-12 lg:pt-8">
          <div key={path} className="animate-page">{children}</div>
        </main>
      </div>

      {/* Mobile bottom navigation with a raised voice button */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <ul className="mx-auto grid max-w-2xl grid-cols-5 items-end">
          <li>{tab("/", "home", "nav.home")}</li>
          <li>{tab("/countcam", "camera", "nav.tab.countcam")}</li>
          <li className="flex justify-center">
            <button type="button" onClick={() => setVoiceOpen(true)} aria-haspopup="dialog" aria-label={t("home.voice.title")}
              className="-mt-7 mb-1 flex flex-col items-center gap-1 text-[0.72rem] font-semibold leading-none text-brand">
              <span className="breathe isolate grid h-16 w-16 place-items-center rounded-full bg-brand text-brand-ink shadow-[0_10px_24px_-8px_var(--brand)] ring-4 ring-bg transition active:scale-95">
                <Icon name="mic" size={28} />
              </span>
              <span>{t("nav.speak")}</span>
            </button>
          </li>
          <li>{tab("/report", "alert", "nav.tab.report")}</li>
          <li>
            <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog"
              className="relative flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[0.72rem] font-semibold leading-none text-muted">
              <span className="grid h-8 w-14 place-items-center rounded-full"><Icon name="menu" size={22} /></span>
              <span>{t("nav.menu")}</span>
              {(sync.pending > 0 || attention > 0) && (
                <span className="absolute right-[18%] top-2"><Badge n={sync.pending + attention} danger={attention > 0} /></span>
              )}
            </button>
          </li>
        </ul>
      </nav>

      {menuOpen && <MenuSheet onClose={() => setMenuOpen(false)} />}
      {voiceOpen && <VoicePanel onClose={() => setVoiceOpen(false)} />}
    </div>
  );
}
