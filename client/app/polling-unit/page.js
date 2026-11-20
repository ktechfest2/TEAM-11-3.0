"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { Card, Notice, Pill, TextInput } from "@/components/ui";
import { normalize } from "@/lib/nano/intent/featurizer";

const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/**
 * Polling-unit lookup. Requires INEC's published polling-unit list, converted to
 * /data/polling-units.json: { "source": str, "publishedAt": str,
 *   "units": [{ "code": "24-11-05-003", "name": str, "ward": str, "lga": str, "state": str }] }
 * Until that list exists we fall back to /data/polling-units.demo.json: clearly labelled DEMO-
 * units that match the server's seeded demo results (deploy/seed_demo.py). We never invent real units.
 */
export default function PollingUnitPage() {
  const { t } = useApp();
  const [data, setData] = useState(undefined);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => setData((await getJson("/data/polling-units.json")) || (await getJson("/data/polling-units.demo.json"))))();
  }, []);

  const results = useMemo(() => {
    if (!data) return [];
    const nq = normalize(q);
    if (nq.length < 2) return data.demo ? data.units : [];
    return data.units.filter((u) => normalize(`${u.code} ${u.name} ${u.ward} ${u.lga} ${u.state}`).includes(nq)).slice(0, 50);
  }, [data, q]);

  const official = (
    <p className="mt-2">{t("pu.official")} <a className="font-semibold underline" href="https://inecnigeria.org" target="_blank" rel="noreferrer">inecnigeria.org</a></p>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("pu.title")} />
      {data === null && <Notice tone="warn"><p>{t("pu.unavailable")}</p>{official}</Notice>}
      {data?.demo && <Notice tone="warn" title={t("pu.demoTitle")}><p>{t("pu.demo")}</p>{official}</Notice>}
      {data && (
        <>
          <p className="text-sm text-muted">{t("info.source")}: {data.source} · {data.publishedAt}</p>
          <TextInput label={t("info.search")} type="search" value={q} onChange={setQ} hint="State, LGA, ward, name or code" />
          <ul className="flex flex-col gap-2">
            {results.map((u) => (
              <li key={u.code}>
                <Card>
                  {data.demo && <Pill tone="warn">{t("pu.demoTitle")}</Pill>}
                  <p className="font-bold">{u.name}</p>
                  <p className="text-muted">{u.code} · {u.ward}, {u.lga}, {u.state}</p>
                  {data.demo && (
                    <Link className="text-sm font-semibold text-brand underline" href={`/results?pu=${encodeURIComponent(u.code)}`}>{t("track.compare")}</Link>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
