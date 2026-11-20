/**
 * AwaVote Nano pipeline:
 *   audio -> local speech-to-text -> language ID -> intent classification -> routing
 *   -> confirmation (sensitive actions) -> execution -> concise spoken response.
 *
 * UI-framework independent. The host app supplies:
 *   getSettings()     { language, speechRate, allowOnlineSpeech, mmsVoice, speech, voicePacks }
 *   execute(action)   performs navigate / set_language / go_back / read_aloud / sync_now
 */
import { classify, release as releaseIntent, warmup } from "./intent/classifier";
import { route } from "./router";
import { selectRecognizer } from "./asr";
import * as tts from "./tts";
import { hasTranslation, translate } from "../i18n/messages";

/** Voice debug log: on in development, or anywhere with localStorage["awavote.debug"] = "1". */
const DEBUG = process.env.NODE_ENV !== "production" || (() => { try { return localStorage.getItem("awavote.debug") === "1"; } catch { return false; } })();

/** English and Pidgin share one speech model; every other language is its own family. */
const family = (lang) => (lang === "pcm" ? "en" : lang);

export class NanoEngine extends EventTarget {
  constructor({ getSettings, execute }) {
    super();
    Object.assign(this, { getSettings, execute });
    this.state = "idle";
    this.pendingConfirmation = null;
    this.lastResponse = null;
    this.lastTranscript = "";
    this.abort = null;
  }

  emit(type, detail) {
    if (DEBUG && type !== "level" && type !== "state") console.info("[voice]", type, JSON.stringify(detail)?.slice(0, 300));
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  setState(state, extra = {}) { this.state = state; this.emit("state", { state, ...extra }); }

  t(key, vars, lang) {
    return translate(lang ?? this.getSettings().language, key, vars);
  }

  /** Speak a short response. `lang` overrides the UI language (used right after switching). */
  async respond(key, vars = {}, { speakIt = true, lang } = {}) {
    const s = this.getSettings();
    const language = lang ?? s.language;
    const text = this.t(key, vars, language);
    this.lastResponse = { key, vars };
    this.emit("response", { key, text });
    if (speakIt) {
      this.setState("speaking");
      const r = await tts.speak(text, { lang: language, rate: s.speechRate, key, mmsEnabled: s.mmsVoice });
      if (!r.spoken) this.emit("tts-unavailable", { reason: r.reason, lang: language });
    }
    this.setState("idle");
    return text;
  }

  /** Capture one spoken command. Returns the transcript (also emitted) so the user can correct it. */
  async listen() {
    const s = this.getSettings();
    if (s.autoLanguage !== false && !(s.allowOnlineSpeech && s.speech?.status !== "ready")) {
      // Record one phrase, then the automatic-language pipeline (same as hands-free).
      tts.stop();
      this.abort = new AbortController();
      try {
        this.setState("listening");
        const { recordUtterance, hasSpeech } = await import("./asr/recorder");
        const pcm = await recordUtterance({ onLevel: (level) => this.emit("level", { level }), signal: this.abort.signal });
        if (!hasSpeech(pcm)) { await this.respond("voice.didntCatch"); return null; }
        return await this.handleUtterance(pcm, { source: "panel" });
      } catch (e) {
        if (e.name === "AbortError") { this.setState("idle"); return null; }
        this.emit("error", { message: e.message });
        await this.respond(e.name === "NotAllowedError" ? "voice.micDenied" : "voice.error");
        return null;
      } finally {
        this.abort = null;
      }
    }
    const rec = selectRecognizer({ allowOnline: s.allowOnlineSpeech, speech: s.speech,
      templatePack: !!s.voicePacks?.[s.language]?.commands });
    if (!rec) {
      this.emit("asr-unavailable", { lang: s.language });
      await this.respond("voice.asrUnavailable", {}, { speakIt: true });
      return null;
    }
    tts.stop();
    this.abort = new AbortController();
    try {
      warmup().catch(() => {}); // load the tiny intent model while the user speaks
      const r = await rec.listen({
        lang: s.language, signal: this.abort.signal,
        onLevel: (level) => this.emit("level", { level }),
        onState: (st) => this.setState(st),
      });
      this.emit("transcript", r);
      if (r.provider === "templates-local") {
        // Template recogniser returns an intent directly (no transcript to classify).
        if (r.noSpeech || !r.intent) { await this.respond("voice.didntCatch"); return null; }
        const c = { intent: r.intent, confidence: r.confidence, margin: r.confidence, alternatives: r.alternatives || [],
          language: s.language, languageConfidence: 1, confident: r.confidence >= 0.5, latencyMs: r.latencyMs };
        const action = route(c, "", { pendingConfirmation: this.pendingConfirmation });
        this.emit("result", { text: "", classification: c, action });
        await this.perform(action, c);
        return r.intent;
      }
      if (!r.text) { await this.respond("voice.didntCatch"); return null; }
      await this.handleText(r.text, { asrConfidence: r.confidence });
      return r.text;
    } catch (e) {
      if (e.name === "AbortError") { this.setState("idle"); return null; }
      this.emit("error", { message: e.message });
      await this.respond(e.name === "NotAllowedError" ? "voice.micDenied" : "voice.error");
      return null;
    } finally {
      this.abort = null;
    }
  }

  cancelListening() { this.abort?.abort(); tts.stop(); this.setState("idle"); }

  /** Load everything a spoken command needs (hands-free mode), so the first one is fast. */
  async prepare() {
    const s = this.getSettings();
    warmup().catch(() => {});
    const sp = await import("./speech");
    sp.setKeepLoaded(true);
    if (s.autoLanguage !== false) await import("./lid").then((m) => m.warmupLid()).catch(() => {});
    const choice = sp.chooseModel(s.language, await sp.getCatalog());
    if (choice && await sp.isModelCached(choice)) await sp.loadRecognizer(choice).catch(() => {});
  }

  /**
   * A phrase captured by hands-free listening (or the panel) — the whole pipeline with
   * automatic language: detect the spoken language, transcribe with that language's model,
   * switch the app to that language if it changed, then understand and act.
   * `source: "handsfree"` = nobody pressed anything: only act on clear commands and stay
   * silent about background talk (no "I didn't catch that" for every TV voice).
   */
  async handleUtterance(pcm, { source = "handsfree" } = {}) {
    if (this.busy) return null;
    this.busy = true;
    const s = this.getSettings();
    const quiet = source === "handsfree" && !this.pendingConfirmation;
    const idleOr = async (key) => { if (!quiet) await this.respond(key); else this.setState("idle"); return null; };
    try {
      this.setState("transcribing");
      warmup().catch(() => {});
      const current = s.language;
      // 1. Which language is this? (en = English or Pidgin: one speech model serves both)
      let spoken = null;
      if (s.autoLanguage !== false) {
        const { detectSpokenLanguage } = await import("./lid");
        spoken = await detectSpokenLanguage(pcm).catch(() => null);
        this.emit("spoken-language", spoken || {});
      }
      // Languages to try, best guess first. English and Pidgin share one model ("en" family).
      const asLang = (l) => (l === "en" ? (current === "pcm" ? "pcm" : "en") : l);
      const ranked = spoken ? Object.entries(spoken.probs).sort((x, y) => y[1] - x[1]) : [];
      // Sure (>= 0.6): the top language, then (if needed) the current one. Unsure: every language with
      // >= 15 % (max 3) is transcribed and the most confident command wins — guessing wrong would
      // make AwaVote act on a mis-heard command.
      const unsure = !spoken || spoken.p < 0.6;
      const tries = [];
      for (const [l, p] of ranked) if (tries.length < 3 && (tries.length === 0 || (unsure ? p >= 0.15 : p >= 0.3))) tries.push(asLang(l));
      if (!spoken || spoken.p < 0.3) tries.unshift(current);
      if (!tries.some((l) => family(l) === family(current)) && !(spoken?.p >= 0.85)) tries.push(current); // also the current language
      const order = [...new Set(tries)].slice(0, unsure ? 4 : 3);

      // 2. Transcribe + understand.
      let best = null;
      for (const [k, lang] of order.entries()) {
        const spokenP = spoken && family(asLang(spoken.lang)) === family(lang) ? spoken.p : 0;
        let res = await this.#understandIn(lang, pcm, { spokenP });
        // Fast short-window transcript unclear for the most likely language? Re-check with the full window.
        if (k === 0 && res && !res.fits && res.r.shortWindow) res = (await this.#understandIn(lang, pcm, { full: true, spokenP })) || res;
        if (!res) continue;
        if (!best || (res.fits && !best.fits) || (res.fits === best.fits && (res.c?.confidence ?? 0) > (best.c?.confidence ?? 0))) best = res;
        if (res.fits && !unsure) break;
      }
      if (!best) { if (!quiet) this.emit("asr-unavailable", { lang: order[0] }); return idleOr("voice.asrUnavailable"); }
      const { r, c } = best;
      this.emit("transcript", r);
      if (!c) return idleOr("voice.didntCatch");

      const action = route(c, r.text, { pendingConfirmation: this.pendingConfirmation });
      if (quiet && (!c.confident || c.intent === "unknown" || ["clarify", "out_of_scope", "nothing_pending"].includes(action.type))) {
        this.emit("ignored", { text: r.text, classification: c });
        this.setState("idle");
        return null;
      }
      // 3. Follow the user's language.
      if (s.autoLanguage !== false && c.language && c.language !== this.getSettings().language) {
        await this.execute({ type: "set_language", lang: c.language, auto: true });
        this.emit("language-switched", { lang: c.language, from: current });
      }
      this.lastTranscript = r.text;
      this.emit("result", { text: r.text, classification: c, action, spoken });
      await this.perform(action, c);
      return r.text || c.intent;
    } catch (e) {
      this.emit("error", { message: e.message });
      return idleOr(e.name === "NotAllowedError" ? "voice.micDenied" : "voice.error");
    } finally {
      this.busy = false;
    }
  }

  /**
   * Transcribe `pcm` as language `lang` and classify it.
   * @returns {Promise<{r, c, fits: boolean} | null>} fits = a confident command whose words are in that language
   */
  async #understandIn(lang, pcm, { full = false, spokenP = 0 } = {}) {
    const { transcribeIn } = await import("./asr");
    const r = await transcribeIn(lang, pcm, { full });
    this.emit("attempt", { lang, text: r?.text, provider: r?.provider, model: r?.model, ms: r?.latencyMs, short: r?.shortWindow });
    if (!r) return null;
    if (r.provider === "templates-local") {
      if (!r.intent) return { r, c: null, fits: false };
      const c = { intent: r.intent, confidence: r.confidence, margin: r.confidence, alternatives: r.alternatives || [],
        language: lang, languageConfidence: 1, confident: r.confidence >= 0.5, latencyMs: r.latencyMs };
      return { r, c, fits: c.confident };
    }
    if (!r.text || r.text.replace(/[^\p{L}]/gu, "").length < 2) return { r, c: null, fits: false };
    this.setState("understanding");
    const c = await classify(r.text);
    const textLang = c.language;
    // English-family speech: the words decide English vs Pidgin. Otherwise the model's language stands.
    if (family(lang) === "en") c.language = textLang === "pcm" && c.languageConfidence >= 0.5 ? "pcm" : textLang === "en" ? "en" : lang;
    else c.language = lang;
    const wordsAgree = family(textLang) === family(lang) || c.languageConfidence < 0.5;
    // Two independent signals: the voice is near-certainly this language, and the words point clearly
    // (if not strongly) to one command. Together they count as a confident command.
    if (!c.confident && spokenP >= 0.9 && wordsAgree && c.intent !== "unknown" && c.confidence >= 0.33 && c.margin >= 0.15) {
      c.confident = true;
      c.fusedWithSpokenLanguage = true;
    }
    return { r, c, fits: c.confident && c.intent !== "unknown" && wordsAgree };
  }

  /** Entry point for typed or corrected commands (same pipeline minus ASR). */
  async handleText(text, { asrConfidence = null } = {}) {
    this.lastTranscript = text;
    this.setState("understanding");
    const c = await classify(text);
    // A low-confidence transcript from the recogniser also forces clarification.
    if (asrConfidence !== null && asrConfidence < 0.5) c.confident = false;
    const action = route(c, text, { pendingConfirmation: this.pendingConfirmation });
    this.emit("result", { text, classification: c, action });
    return this.perform(action, c);
  }

  async perform(action, c) {
    const name = (intent) => this.t(`intent.${intent}`);
    switch (action.type) {
      case "navigate": {
        await this.execute(action);
        // Never a half-translated sentence: without a translated page name, a short "Done" instead.
        const lang = this.getSettings().language;
        return hasTranslation(lang, `intent.${action.intent}`) && hasTranslation(lang, "voice.opening")
          ? this.respond("voice.opening", { name: name(action.intent) }) : this.respond("voice.done");
      }
      case "confirm":
        this.pendingConfirmation = action.action;
        this.emit("confirm-request", { action: action.action, promptKey: action.promptKey });
        return this.respond(action.promptKey);
      case "confirmed": {
        this.pendingConfirmation = null;
        this.emit("confirm-resolved", { accepted: true });
        const ok = await this.execute(action.action);
        return this.respond(ok === false ? "voice.actionFailed" : "voice.done");
      }
      case "cancelled":
        this.pendingConfirmation = null;
        this.emit("confirm-resolved", { accepted: false });
        return this.respond("voice.cancelled");
      case "clarify":
        this.emit("clarify", { options: action.options });
        return action.options.length >= 2
          ? this.respond("voice.clarify2", { a: name(action.options[0]), b: name(action.options[1]) })
          : this.respond("voice.didntUnderstand");
      case "set_language":
        await this.execute(action);
        return this.respond("voice.languageChanged", {}, { lang: action.lang });
      case "go_back":
      case "read_aloud":
        await this.execute(action);
        return action.type === "go_back" ? this.respond("voice.done", {}, { speakIt: false }) : this.setState("idle");
      case "repeat":
        if (!this.lastResponse) return this.respond("voice.nothingToRepeat");
        return this.respond(this.lastResponse.key, this.lastResponse.vars);
      case "help":
        await this.execute({ type: "navigate", path: "/voice" });
        return this.respond("voice.help");
      case "stop_speaking":
        tts.stop();
        return this.setState("idle");
      case "nothing_pending":
        return this.respond("voice.nothingPending");
      default:
        return this.respond("voice.outOfScope");
    }
  }

  /** Confirm or reject via buttons (touch fallback for the spoken yes/no). */
  async answerConfirmation(accepted) {
    if (!this.pendingConfirmation) return;
    return this.perform(accepted ? { type: "confirmed", action: this.pendingConfirmation } : { type: "cancelled" });
  }

  /** Free model memory when voice mode closes — nothing runs in the background. */
  async release() {
    this.cancelListening();
    await releaseIntent();
  }
}
