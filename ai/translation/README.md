# Interface translation

`translate_ui.py` translates AwaVote's interface text (`client/lib/i18n/messages.js`, English) and
writes `client/lib/i18n/machine.js`. The app shows text in this order: native-speaker
contributions, hand-set strings, these model translations, English.

| Language | Model | Licence |
|---|---|---|
| Yorùbá, Hausa, Igbo | Meta NLLB-200 distilled 600M (CTranslate2 int8) | CC-BY-NC 4.0 |
| Nigerian Pidgin | NITHUB-AI `marian-mt-bbc-en-pcm` | CC-BY 4.0 |

## Quality checks (a translation is kept only if it passes all of them)
- **Placeholders and names survive.** `{n}` and `{lang}` are swapped for realistic stand-ins
  during translation and must come back exactly once. AwaVote, INEC, IReV, EC8A, BVAS, PVC and
  English must appear unchanged.
- **Meaning survives.**
  - Yorùbá, Hausa and Igbo: the output is translated back to English with the same model, and the
    back-translation must be close to the source (character 3-gram F-score ≥ 0.45, or ≥ 0.38 for
    sentences of 5+ words).
  - Pidgin: election terms (votes, voters, ballots, accredited, rejected …) must keep the same
    counts, and short labels (under 4 words) stay English.
- **Not truncated.** The output can't be much shorter than the source.
- **Known rejects stay out.** `rejected.json` lists translations rejected by hand; they stay English.

Result (Nov 2026), including the hand-set strings: Hausa 62%, Igbo 58%, Yorùbá 43%, Pidgin 36% of
interface text.

```bash
ai/.venv/bin/python ai/translation/translate_ui.py --langs yo ha ig pcm
# AWAVOTE_MT_NLLB / AWAVOTE_MT_PCM = local model folders, to avoid re-downloading
```
Only keys without a translation are processed. Delete a language's entries in `machine.js` to
redo it.
