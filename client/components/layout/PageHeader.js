"use client";
import { useRouter } from "next/navigation";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";
import SpeakButton from "@/components/voice/SpeakButton";

export default function PageHeader({ title, subtitle, back = true }) {
  const { t } = useApp();
  const router = useRouter();
  return (
    <div className="mb-2 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {back ? (
          <button type="button" onClick={() => router.back()}
            className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-full pl-2 pr-4 font-semibold text-muted transition hover:bg-surface-2 hover:text-ink active:scale-95">
            <Icon name="back" size={22} /> {t("common.back")}
          </button>
        ) : <span />}
        <SpeakButton />
      </div>
      <div>
        <h1 className="text-[2rem] font-bold leading-[1.1] sm:text-[2.4rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[1.05rem] leading-snug text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
