# AwaVote — end-to-end test report (20 Nov 2026)

**Setup:** exactly the deployed configuration. One server (`AWAVOTE_STATIC_DIR` mode) serves the
production build, the API and the four N-ATLaS speech models on one origin, with the labelled demo
data loaded. The client is real headless Chrome at phone size (430×900) with a fresh profile.

**Inputs:**
- **Microphone:** synthetic voices (Meta MMS-TTS) played into `getUserMedia`. Everything after the
  microphone is the real app: voice detection, language detection, speech models, command model.
- **Camera:** Chrome's built-in fake camera.

## Result: 36 / 37 checks passed, 0 page errors
| Area | Check | Result |
|---|---|---|
| Home | loads; live countdown ticks every second; AwaVote logo; `favicon.ico` | ✔ ✔ ✔ ✔ |
| Hands-free | listening starts after one tap (first time only) | ✔ |
| Hands-free | the phone downloads the speech models for all 4 languages by itself | ✔ |
| Voice, English | "find my polling unit" → polling-unit page | ✔ 8.2 s |
| Voice, Yorùbá | "fi àwọn olùdíje hàn mí" → candidates; app switches to Yorùbá, replies "Ó ti parí" | ✔ 12.2 s |
| Voice, Hausa | "kai rahoton lamari" → report page; app switches to Hausa, replies "An gama" | ✔ 12.1 s |
| Voice, Pidgin | "make i snap the result sheet" → camera; app switches to Pidgin, replies "E don do" | ✔ 12.8 s |
| Voice, Igbo | "chọta ebe ntuli aka m" → polling-unit page | ✘ (see limits) |
| Voice | background talk is ignored (nothing happens) | ✔ |
| Voice, English | "show the candidates" → candidates; app back in English | ✔ 6.7 s |
| Candidates | presidential list: 19 party logos, 7 photos; governorship → Kaduna; search "APC" → 1 result with photo | ✔ ✔ ✔ |
| **Track a result** | `DEMO-001`: photos agree, announced result **matches** the wall | ✔ |
| **Track a result** | `DEMO-002`: announced result **differs**, APC row flagged 120 → 150 (**+30**) | ✔ |
| **Track a result** | an observer enters an announced result through the form with the key (`DEMO-003`, stored on the server) | ✔ |
| Scan result sheet | camera preview; capture → keep → saved as evidence (uploaded: `AWV-EV-…`) | ✔ ✔ |
| Report | incident saved and uploaded (`AWV-IN-…` on the server) | ✔ |
| Pages | uploads, verify, polling unit, info, dashboard, evidence, languages, voice help, contribute | ✔ ×9 |
| Settings | dark theme; text size; hands-free and detect-language switches | ✔ ✔ ✔ |
| Offline | app shows offline; Yorùbá voice command works with no network; candidates with photos and logos | ✔ ✔ ✔ |

**Also:**
- the server's audit chain verifies as intact after the run;
- server tests: 33/33 (including the wall-vs-announced and observer-key tests);
- client unit tests: 40/40;
- `npm run build`: OK; lint: 0 errors.

Times run from the end of speech until the page changed, on a laptop (WebAssembly, 4 threads),
including language detection and loading that language's speech model.

## Limits
1. **Igbo spoken by the synthetic test voice is not recognised.** The language detector hears that
   voice as Yorùbá, so nothing happens; there is no wrong action. Real Igbo speakers (NaijaVox
   samples) were detected correctly.
2. **Commands are recognised reliably when they are close to the app's command phrasings.** Other
   wordings may be ignored in hands-free mode. Native-speaker phrasings from `/contribute` extend
   the command model.
3. **Speed:** 7–13 s per command on a laptop, longer the first time a language loads. Phones will be
   slower.
4. **Translated interface text:** Hausa 62%, Igbo 58%, Yorùbá 43%, Pidgin 36%. Only translations
   that pass the quality checks are used; the rest is English.
