import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { featurizeSparse, normalize } from "@/lib/nano/intent/featurizer";
import { route } from "@/lib/nano/router";
import { extractLanguage } from "@/lib/nano/slots";

const vectors = JSON.parse(readFileSync(new URL("../lib/nano/intent/parity_vectors.json", import.meta.url)));

describe("featuriser parity with ai/intent/featurizer.py", () => {
  for (const v of vectors) {
    it(JSON.stringify(v.text), () => {
      expect(normalize(v.text)).toBe(v.normalized);
      const js = featurizeSparse(v.text);
      expect([...js.keys()].sort((a, b) => a - b).map(String)).toEqual(Object.keys(v.features));
      for (const [k, val] of Object.entries(v.features)) expect(js.get(Number(k))).toBeCloseTo(val, 5);
    });
  }
});

const c = (intent, p = 0.9, extra = {}) => ({ intent, confidence: p, margin: 0.5, confident: p >= 0.45, alternatives: [{ label: "nav.home", p: 0.05 }], ...extra });

describe("command router", () => {
  it("navigates on a confident nav intent", () => {
    expect(route(c("nav.countcam"), "scan")).toMatchObject({ type: "navigate", path: "/countcam" });
  });
  it("asks for clarification instead of guessing when unsure", () => {
    expect(route(c("nav.countcam", 0.3), "mumble").type).toBe("clarify");
  });
  it("requires confirmation for uploading data", () => {
    const r = route(c("nav.sync"), "upload everything");
    expect(r.type).toBe("confirm");
    expect(route(c("action.confirm"), "yes", { pendingConfirmation: r.action })).toEqual({ type: "confirmed", action: r.action });
    expect(route(c("action.cancel"), "no", { pendingConfirmation: r.action }).type).toBe("cancelled");
  });
  it("extracts the target language", () => {
    expect(route(c("action.change_language"), "change language to Yorùbá")).toEqual({ type: "set_language", lang: "yo" });
    expect(extractLanguage("yi magana da Turanci")).toBe("en");
    expect(extractLanguage("gbanwee asụsụ gaa Igbo")).toBe("ig");
  });
  it("never answers out-of-scope questions", () => {
    expect(route(c("unknown"), "who will win").type).toBe("out_of_scope");
  });
});

describe("clarification options", () => {
  it("never offers yes/no/stop as a guess", () => {
    const r = route({ intent: "nav.incident", confidence: 0.2, margin: 0.01, confident: false,
      alternatives: [{ label: "action.confirm", p: 0.19 }, { label: "nav.voteaccess", p: 0.1 }] }, "banana");
    expect(r).toEqual({ type: "clarify", options: ["nav.incident", "nav.voteaccess"] });
  });
});
