# AwaVote — hackathon submission (Team 11, KTech Fest 3.0, "Every Vote, Every Voice")

| Required | Where |
|---|---|
| One-page problem brief | [`01-problem-brief.md`](01-problem-brief.md) |
| System sketch (diagram) | [`02-system-sketch.png`](02-system-sketch.png) (source: [`02-system-sketch.svg`](02-system-sketch.svg)) |
| Working prototype | the app in this repository (`client/` + `server/`); live demo link below |
| Demo video (≤ 3 min) | recorded by the team, following [`04-demo-script.md`](04-demo-script.md) |
| Write-up: problem, solution, how AI is used, tools | [`03-write-up.md`](03-write-up.md) |
| Credits: libraries, models, datasets | [`CREDITS.md`](CREDITS.md) |
| AI coding assistant declaration | [`03-write-up.md` §6](03-write-up.md#6-ai-coding-assistant-declaration) |
| Public/shared GitHub repository | https://github.com/ktechfest2/TEAM-11-3.0 |
| Live demo link | _fill in after deploying_ ([`05-deploy.md`](05-deploy.md)) |
| Test report | [`06-test-report.md`](06-test-report.md): 36/37 end-to-end checks, 33 server and 40 client tests |

## Try it (judges)
1. Open the live demo link on a phone (Chrome), or on desktop with a narrow window.
2. **Track a result:** enter `DEMO-001`, where the announced result matches the wall, then
   `DEMO-002`, where it differs: APC +30. Both are labelled demo data.
3. **Hands-free voice:** tap **Turn on** once, then say "find my polling unit", or in Yorùbá
   "fi àwọn olùdíje hàn mí". The app switches language by itself.
4. **Offline:** after the first visit, switch on airplane mode. The app keeps working, including
   voice.
5. **Scan result sheet → Verify:** photograph any EC8A (or a printout), read its figures, and see
   the checks.

## How it maps to the judging criteria
- **Relevance (25%):** we take the brief's own story ("is what was on the wall what was counted?")
  and go deep on that one link, from wall to announcement, while serving voters who don't read
  English, have poor network or use low-end phones.
- **Innovation (20%):**
  - "Wall vs announced" built from many independent photos, with tamper-evident receipts and audit
    log;
  - hands-free voice that detects which of 5 languages you speak, with a language-ID model we
    trained;
  - Nigeria's own N-ATLaS speech models converted to run **on the phone, offline**.
- **Technical execution (25%):**
  - a working offline PWA plus API;
  - 33 server tests and 40 client unit tests;
  - an automated end-to-end test in real Chrome (36/37: spoken commands, wall vs announced, camera,
    offline);
  - a one-container deployment.
- **Impact and scalability (20%):** it works with the phones and photos that already exist, needs
  no INEC integration, scales per polling unit, and plugs into observer and party-agent networks.
  Next steps: USSD for basic phones, a direct IReV feed, and EC8B–EC8E collation tracking.
- **Presentation (10%):** demo script, system sketch, and this guide.
