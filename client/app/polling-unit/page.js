"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { Card, Notice, TextInput } from "@/components/ui";
import { normalize } from "@/lib/nano/intent/featurizer";

/**
 * Polling-unit lookup. Requires INEC's published polling-unit list, converted to
 * /data/polling-units.json: { "source": str, "publishedAt": str,
 *   "units": [{ "code": "24-11-05-003", "name": str, "ward": str, "lga": str, "state": str }] }
 * No dataset ships with the app; we never invent polling units.
 */
export default function PollingUnitPage() {
  const { t } = useApp();
  const [data, setData] = useState(undefined);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/data/polling-units.json").then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  }, []);

  const results = useMemo(() => {
    const nq = normalize(q);
    if (!data || nq.length < 2) return [];
    return data.units.filter((u) => normalize(`${u.code} ${u.name} ${u.ward} ${u.lga} ${u.state}`).includes(nq)).slice(0, 50);
  }, [data, q]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("pu.title")} />
      {data === null && (
        <Notice tone="warn">
          <p>{t("pu.unavailable")}</p>
          <p className="mt-2">{t("pu.official")} <a className="font-semibold underline" href="https://inecnigeria.org" target="_blank" rel="noreferrer">inecnigeria.org</a></p>
        </Notice>
      )}
      {data && (
        <>
          <p className="text-sm text-muted">{t("info.source")}: {data.source} · {data.publishedAt}</p>
          <TextInput label={t("info.search")} type="search" value={q} onChange={setQ} hint="State, LGA, ward, name or code" />
          <ul className="flex flex-col gap-2">
            {results.map((u) => (
              <li key={u.code}><Card><p className="font-bold">{u.name}</p><p className="text-muted">{u.code} · {u.ward}, {u.lga}, {u.state}</p></Card></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
