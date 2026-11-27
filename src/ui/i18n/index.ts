import type { Language } from "../../domain/organization";
import { en, type Messages } from "./en";
import { vi } from "./vi";

/**
 * The UI's words, in the Organization's language - one for the whole installation (ADR-0007).
 * Each language is one file holding every sentence; `vi.ts` is typed against `en.ts`, so a
 * sentence missing from one is a type error. Adding a language is adding a file here.
 *
 * The language is set once, before any screen's module is loaded (`main.tsx`), so a screen may
 * read `text()` anywhere - in a component or in a table at the top of its file.
 */

const DICTIONARIES: Record<Language, Messages> = { en, vi };

/** How numbers and dates are written in each language. */
const LOCALES: Record<Language, string> = { en: "en-GB", vi: "vi-VN" };

let current: { language: Language; messages: Messages } = { language: "en", messages: en };

const setLanguage = (language: Language) => {
  current = { language, messages: DICTIONARIES[language] };
  document.documentElement.lang = language;
};

const text = (): Messages => current.messages;

/** The locale numbers and dates are written in. */
const locale = (): string => LOCALES[current.language];

export { locale, setLanguage, text };
