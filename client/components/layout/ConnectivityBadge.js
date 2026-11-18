"use client";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";

export default function ConnectivityBadge() {
  const { t, online, serverUp } = useApp();
  const label = !online ? t("status.offline") : serverUp === false ? t("status.serverDown") : t("status.online");
  const cls = !online ? "border-warn bg-warn-soft text-warn" : serverUp === false ? "border-warn bg-warn-soft text-warn" : "border-ok bg-ok-soft text-ok";
  return (
    <span role="status" aria-live="polite" className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-sm font-semibold ${cls}`}>
      <Icon name={online ? "wifi" : "wifiOff"} size={18} />
      <span>{label}</span>
    </span>
  );
}
