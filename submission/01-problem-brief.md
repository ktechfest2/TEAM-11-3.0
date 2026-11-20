# Problem brief — AwaVote
**Team 11 · KTech Fest 3.0 Hackathon · "Every Vote, Every Voice"**

## The weak link we chose
**The journey of a result, from the sheet pasted on the polling-unit wall to the number that is
finally announced.**

At about 176,000 polling units, the presiding officer fills in the result sheet (Form **EC8A**),
pastes a copy on the wall, and uploads a photo to INEC's Result Viewing portal (**IReV**). The
results are then added up at ward, LGA and state level (EC8B–EC8E) and declared. People photograph
the wall, but those photos stay in private WhatsApp chats. Nobody can say, polling unit by
polling unit, whether **what the community saw is what was counted**.

## Why it matters
- **Trust breaks at this step.** Most post-election disputes ask the same question: did the
  figures change between the polling unit and the declaration? Results that go missing, arrive
  late or don't match what people saw fuel rumours, petitions and sometimes violence.
- **The evidence already exists, but nobody can use it.** Thousands of phones photograph the same
  sheets. Without integrity, comparison and a public place to check, those photos prove nothing.
- **Rumours travel faster than facts.** A claim like "they changed our result" spreads in hours. A
  tamper-evident, polling-unit-level answer is the antidote.

## Who it affects
| Who | Their problem today |
|---|---|
| **Voters** like Amaka, ~93.5 M registered (2023) | Cannot tell whether their community's votes survived collation |
| **Party agents and observers** | Collect EC8A photos but cannot prove they were not edited, or aggregate them |
| **Community leaders, journalists, CSOs** | Need checkable facts quickly, in local languages, often offline |
| **INEC and courts** | Face disputes built on unverifiable claims |

Real conditions we design for:
- **Poor network:** the app works fully offline and syncs later.
- **Many voters do not read English comfortably:** the app follows the language you speak
  (English, Pidgin, Yorùbá, Hausa, Igbo) and reads pages aloud.
- **Low-end phones:** every AI model runs on the phone, and the app installs as a light PWA.

## Our piece of the chain
**AwaVote turns the photos people already take into checkable public evidence:**
1. **Snap.** Photograph the EC8A on the wall. The photo is hashed and stamped on the phone, even
   offline.
2. **Check.** On-device OCR reads the sheet. AwaVote checks that the figures add up, and flags a
   sheet that doesn't as *needs review*, never as fraud.
3. **Agree.** Independent photos of the same polling unit are compared. The figure most photos
   agree on becomes "the wall".
4. **Compare.** Accredited observers enter the officially announced result (from IReV or a
   collation sheet, with its link). AwaVote shows, party by party, whether **the announcement
   matches the wall**.
5. **Prove.** Every record gets an HMAC-signed receipt and a place in a hash-chained,
   tamper-evident audit log.

The result adds **trust without friction**. It uses the phones and the photos that already exist,
needs no new hardware or INEC integration, and speaks the voter's language.
