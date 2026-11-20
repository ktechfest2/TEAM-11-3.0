# 3-minute demo video — script

**Goal:** show the weak link, then go deep on the core feature (wall → announcement), then show that
it works for real people: offline, by voice, in their language.

**Before recording:**
- Use a real Android phone with Chrome, or Chrome's phone view (F12 → device toolbar, ~400 px wide).
- Open the live link once with internet, so everything is cached.
- Tap **Turn on** in the hands-free bar once.
- Have a printed or on-screen EC8A sheet ready to photograph.
- Demo polling units already on the server: `DEMO-001` (the announcement **matches** the wall) and
  `DEMO-002` (it **differs**).

| Time | Show | Say |
|---|---|---|
| **0:00–0:20** | System sketch (`02-system-sketch.png`), then the home screen with the live election countdown | "On election day, results are pasted on the wall of 176,000 polling units. Days later, people can't tell whether what they saw on the wall is what was counted. That's the weak link we chose. AwaVote makes it checkable." |
| **0:20–0:50** | **Scan result sheet:** photograph the EC8A sheet → "Save evidence" (reference number). **Verify:** tap "Read figures from photo" (OCR fills the numbers) → arithmetic checks turn green → save | "An agent or voter snaps the sheet. The photo is fingerprinted on the phone, so edits can be detected. AwaVote reads it and checks that the numbers add up. It never calls anything fraud; a problem is just 'needs review'." |
| **0:50–1:30** | **Track a result** → type `DEMO-001` → "3 photos of the wall agree" + "Announced result matches the wall" ✔. Then `DEMO-002` → the APC row turns red: wall 120, announced 150, **+30** | "Independent photos of the same polling unit are compared, and the figure most of them agree on is 'the wall'. Observers enter the result INEC announced, with its IReV link. Here it matches. Here it doesn't: 30 extra votes for one party. That's a signal to check the collation, within hours, with evidence instead of rumour." |
| **1:30–1:45** | **Dashboard:** official results card (matches / differs counts), Download CSV | "Journalists, CSOs and party agents see every polling unit and can download the data. Every record has a signed receipt and sits in a tamper-evident audit log." |
| **1:45–2:25** | **Hands-free voice.** Without touching the phone, say: "Find my polling unit" (English) → page opens. Then in Yorùbá: "Fi àwọn olùdíje hàn mí" → the app switches to Yorùbá and opens the candidates with their photos and party logos. (Optional: Pidgin, "Make I snap the result sheet") | "Many voters don't read English. AwaVote listens when you speak, works out your language and answers in it: English, Pidgin, Yorùbá, Hausa or Igbo. All the speech AI runs on the phone with Nigeria's own N-ATLaS models. No audio leaves the device." |
| **2:25–2:45** | Turn on **airplane mode** → the app still works: candidates, voter info, and a voice command still works offline | "No network? Everything still works. Reports and photos wait in an outbox and sync when the signal returns." |
| **2:45–3:00** | Settings: large text, high contrast. End on the logo | "Built for real conditions: low-end phones, poor network, any of five languages, elderly voters. AwaVote. Every vote. Every count. Every voice." |

**Tips:**
- Speak clearly, about 30 cm from the phone, and pause after each command. The bar shows "Hearing
  you…", then the answer. A command takes a few seconds on a mid-range phone, longer the first time
  a new language loads.
- Record the screen with the phone's own recorder, and the room audio too, so judges hear the
  commands.
- If a voice command isn't caught, say it again. Don't cut away mid-sentence.
- Keep it under **3:00**. That's a hard rule in the submission guidelines.
