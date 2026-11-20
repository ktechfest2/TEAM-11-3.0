"use client";
import { useMemo, useState } from "react";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { Card, Notice, TextInput, Toggle } from "@/components/ui";
import SpeakButton from "@/components/voice/SpeakButton";
import { CONTENT_META, GLOSSARY, TOPICS } from "@/lib/content/voteaccess";
import { normalize } from "@/lib/nano/intent/featurizer";
import ElectionDates from "@/components/elections/ElectionDates";

export default function InfoPage() {
  const { t, settings } = useApp();
  const [simple, setSimple] = useState(true);
  const [q, setQ] = useState("");
  const nq = normalize(q);
  const topics = useMemo(() => TOPICS.filter((x) => !nq || normalize(`${x.title} ${x.simple} ${x.full}`).includes(nq)), [nq]);
  const terms = GLOSSARY.filter(([k, v]) => !nq || normalize(`${k} ${v}`).includes(nq));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("info.title")} />
      <Notice tone="info">{CONTENT_META.reviewStatus}</Notice>
      <Card className="flex flex-col gap-2">
        <TextInput label={t("info.search")} type="search" value={q} onChange={setQ} />
        <Toggle label={t("info.simple")} checked={simple} onChange={setSimple} />
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">{t("info.timetable")}</h2>
        <ElectionDates />
      </Card>

      {topics.length === 0 && terms.length === 0 && <p>{t("info.noResults")}</p>}
      {topics.map((x) => {
        const body = simple ? x.simple : x.full;
        return (
          <Card key={x.id} as="article" lang="en">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl font-bold">{x.title}</h2>
              <SpeakButton text={`${x.title}. ${body}`} />
            </div>
            <p className="mt-2 text-lg">{body}</p>
          </Card>
        );
      })}

      {terms.length > 0 && (
        <Card lang="en">
          <h2 className="text-lg font-bold">Words to know</h2>
          <dl className="mt-2 flex flex-col gap-2">
            {terms.map(([k, v]) => <div key={k}><dt className="font-bold">{k}</dt><dd className="text-muted">{v}</dd></div>)}
          </dl>
        </Card>
      )}
      <p className="text-sm text-muted">
        {t("info.source")}: <a className="underline" href={CONTENT_META.source.url} target="_blank" rel="noreferrer">{CONTENT_META.source.name}</a> · {t("info.reviewed")}: {CONTENT_META.updatedAt}
      </p>
    </div>
  );
}
