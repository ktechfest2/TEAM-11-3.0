/** Rule-based slot extraction (language names in all five languages). */
import { normalize } from "./intent/featurizer";

const LANGUAGE_WORDS = {
  en: ["english", "oyinbo", "turanci", "bekee", "geesi", "gesi"],
  pcm: ["pidgin", "pijin", "broken"],
  yo: ["yoruba", "yarbanci", "yarbawa", "yoruba language"],
  ha: ["hausa", "awusa"],
  ig: ["igbo", "ibo", "inyamuranci"],
};

export function extractLanguage(text) {
  const words = normalize(text).split(" ");
  for (const [code, names] of Object.entries(LANGUAGE_WORDS)) {
    if (names.some((n) => (n.includes(" ") ? words.join(" ").includes(n) : words.includes(n)))) return code;
  }
  return null;
}
