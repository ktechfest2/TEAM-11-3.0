"use client";
import { useRouter } from "next/navigation";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";
import SpeakButton from "@/components/voice/SpeakButton";

export default function PageHeader({ title, subtitle, back = true }) {
  const { t } = useApp();
  const router = useRouter();
  return (
    <div className="mb-4 flex items-start gap-2">
      {back && (
        <button type="button" onClick={() => router.back()} className="-ml-2 grid min-h-12 min-w-12 place-items-center rounded-xl hover:bg-surface-2" aria-label={t("common.back")}>
          <Icon name="back" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      <SpeakButton />
    </div>
  );
}
