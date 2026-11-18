/**
 * Languages AwaVote is working towards. Goal: languages that together reach ~90% of
 * Nigerians (as a first or second language). Order = rollout priority.
 *
 * Status is NOT declared here; it is measured. Each language's real support level comes
 * from approved contributions and held-out accuracy tests (GET /api/languages/stats):
 *   ui:    share of interface text approved by native-speaker reviewers
 *   voice: on-device command recognition, "validated" only at >= 90% accuracy measured on
 *          >= 5 speakers whose voices are NOT in the templates (>= 100 attempts)
 *   audio: share of spoken prompts recorded by native speakers (replaces text-to-speech)
 *
 * `bcp47` is used for <html lang>, device voices and date formatting.
 */
export const LANGUAGES = [
  { code: "en", name: "English", native: "English", bcp47: "en-NG", tier: 1, source: true },
  { code: "pcm", name: "Nigerian Pidgin", native: "Naijá", bcp47: "pcm", tier: 1 },
  { code: "ha", name: "Hausa", native: "Hausa", bcp47: "ha", tier: 1 },
  { code: "yo", name: "Yoruba", native: "Yorùbá", bcp47: "yo", tier: 1 },
  { code: "ig", name: "Igbo", native: "Igbo", bcp47: "ig", tier: 1 },
  { code: "ff", name: "Fulfulde", native: "Fulfulde", bcp47: "ff", tier: 2 },
  { code: "kr", name: "Kanuri", native: "Kanuri", bcp47: "kr", tier: 2 },
  { code: "tiv", name: "Tiv", native: "Tiv", bcp47: "tiv", tier: 2 },
  { code: "ibb", name: "Ibibio", native: "Ibibio", bcp47: "ibb", tier: 2 },
  { code: "efi", name: "Efik", native: "Efik", bcp47: "efi", tier: 2 },
  { code: "ijc", name: "Ijaw (Izon)", native: "Izon", bcp47: "ijc", tier: 2 },
  { code: "bin", name: "Edo (Bini)", native: "Ẹ̀dó", bcp47: "bin", tier: 2 },
  { code: "urh", name: "Urhobo", native: "Urhobo", bcp47: "urh", tier: 2 },
  { code: "nup", name: "Nupe", native: "Nupe", bcp47: "nup", tier: 2 },
  { code: "igl", name: "Igala", native: "Igala", bcp47: "igl", tier: 2 },
  { code: "idu", name: "Idoma", native: "Idoma", bcp47: "idu", tier: 2 },
  { code: "igb", name: "Ebira", native: "Ebira", bcp47: "igb", tier: 2 },
  { code: "iso", name: "Isoko", native: "Isoko", bcp47: "iso", tier: 2 },
  { code: "bom", name: "Berom", native: "Berom", bcp47: "bom", tier: 2 },
  { code: "kcg", name: "Tyap", native: "Tyap", bcp47: "kcg", tier: 2 },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
export const languageByCode = (code) => LANGUAGES.find((l) => l.code === code);
