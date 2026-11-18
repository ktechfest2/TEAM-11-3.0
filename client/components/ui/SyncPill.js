"use client";
import { useApp } from "@/hooks/useApp";
import { Pill } from "./index";

const TONE = { pending: "info", synced: "ok", failed: "danger", conflict: "danger" };

export default function SyncPill({ status }) {
  const { t } = useApp();
  return <Pill tone={TONE[status] || "muted"} icon={status === "synced" ? "check" : "upload"}>{t(`sync.${status}`)}</Pill>;
}
