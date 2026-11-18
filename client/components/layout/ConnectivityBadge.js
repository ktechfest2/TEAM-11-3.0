"use client";
import { useApp } from "@/hooks/useApp";

/** Online / offline status. `compact` shows a dot + short word for the mobile header. */
export default function ConnectivityBadge({ compact = false }) {
  const { t, online, serverUp } = useApp();
  const state = !online ? "offline" : serverUp === false ? "degraded" : "online";
  const full = state === "offline" ? t("status.offline") : state === "degraded" ? t("status.serverDown") : t("status.online");
  const label = compact && state === "degraded" ? t("status.serverShort") : full;
  const dot = { offline: "bg-warn", degraded: "bg-warn", online: "bg-ok" }[state];
  const tone = state === "online" ? "text-ok bg-ok-soft" : "text-warn bg-warn-soft";
  return (
    <span role="status" aria-live="polite" title={full} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold ${tone}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className={compact ? "sr-only whitespace-nowrap min-[360px]:not-sr-only" : ""}>{label}</span>
      {compact && state === "degraded" && <span className="sr-only">{full}</span>}
    </span>
  );
}
