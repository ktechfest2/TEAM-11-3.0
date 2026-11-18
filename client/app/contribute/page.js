"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { Button, Card, Notice, Select, TextInput } from "@/components/ui";
import { languageByCode } from "@/lib/i18n/languages";
import { apiFetch } from "@/services/api";
import * as api from "@/services/contrib";
import { CommandsTab, PromptsTab, ReviewTab, TestTab, TranslateTab } from "@/features/contribute/tabs";

const TABS = [
  ["translate", "Translate"], ["prompts", "Record prompts"], ["commands", "Record commands"], ["test", "Accuracy test"], ["review", "Review"],
];

/** Workspace for native-speaker translators, voice contributors and reviewers. Needs a contributor token. */
export default function ContributePage() {
  const { online } = useApp();
  const [who, setWho] = useState(undefined);
  const [token, setTokenInput] = useState("");
  const [error, setError] = useState(null);
  const [lang, setLang] = useState("");
  const [tab, setTab] = useState("translate");
  const [published, setPublished] = useState({});

  useEffect(() => {
    api.getToken().then((t) => (t ? api.me().then(setWho).catch(() => setWho(null)) : setWho(null)));
  }, []);
  useEffect(() => { if (who && !lang) setLang(who.languages[0] || ""); }, [who, lang]);
  useEffect(() => {
    if (lang) apiFetch(`/api/i18n/${lang}`).then((d) => setPublished(d.messages)).catch(() => setPublished({}));
  }, [lang, tab]);

  async function signIn(e) {
    e.preventDefault();
    setError(null);
    await api.setToken(token.trim());
    try { setWho(await api.me()); setTokenInput(""); } catch { setError("That access code was not accepted."); await api.setToken(null); }
  }

  if (!online) return <div className="flex flex-col gap-4"><PageHeader title="Contribute" /><Notice tone="warn">Contributing needs an internet connection.</Notice></div>;
  if (who === undefined) return <p>Loading…</p>;
  if (!who) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Contribute your language" subtitle="For native-speaker translators, voice contributors and reviewers" />
        <Card as="form" onSubmit={signIn} className="flex flex-col gap-3">
          <TextInput label="Contributor access code" value={token} onChange={setTokenInput} autoComplete="off" />
          <Button type="submit" disabled={!token.trim()}>Sign in</Button>
          {error && <Notice tone="danger">{error}</Notice>}
          <p className="text-sm text-muted">Access codes are issued by the AwaVote team to registered native speakers.</p>
        </Card>
      </div>
    );
  }

  const isReviewer = who.role === "reviewer" || who.role === "admin";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Contribute" subtitle={`${who.name} · ${who.role}`} />
      <Select label="Language" value={lang} onChange={setLang}
        options={who.languages.map((l) => ({ value: l, label: `${languageByCode(l)?.native ?? l} (${languageByCode(l)?.name ?? l})` }))} />
      <div role="tablist" aria-label="Contribution type" className="flex flex-wrap gap-2">
        {TABS.filter(([id]) => id !== "review" || isReviewer).map(([id, label]) => (
          <Button key={id} role="tab" aria-selected={tab === id} size="md" variant={tab === id ? "primary" : "secondary"} onClick={() => setTab(id)}>{label}</Button>
        ))}
      </div>
      {lang && (
        <div role="tabpanel">
          {tab === "translate" && <TranslateTab lang={lang} />}
          {tab === "prompts" && <PromptsTab lang={lang} published={published} />}
          {tab === "commands" && <CommandsTab lang={lang} />}
          {tab === "test" && <TestTab lang={lang} meId={who.id} />}
          {tab === "review" && isReviewer && <ReviewTab lang={lang} meId={who.id} />}
        </div>
      )}
      <Button variant="ghost" onClick={async () => { await api.setToken(null); setWho(null); }}>Sign out</Button>
    </div>
  );
}
