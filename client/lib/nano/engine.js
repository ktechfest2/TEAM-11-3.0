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
import { translate } from "../i18n/messages";

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

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
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
      case "navigate":
        await this.execute(action);
        return this.respond("voice.opening", { name: name(action.intent) });
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
