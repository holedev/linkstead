/**
 * What an installation knows about the one Organization it serves (CONTEXT.md, ADR-0007): its
 * name, which email domains its Accounts may have, the language its pages speak, the time zone
 * its days are counted in, and its colour. Set by a System Administrator, kept in the data.
 */

import { isTimeZone } from "./time-zone";

const LANGUAGES = ["en", "vi"] as const;
type Language = (typeof LANGUAGES)[number];

type OrganizationSettings = {
  name: string;
  /** Exact domains an Account's email may have. Empty: any address. */
  emailDomains: string[];
  language: Language;
  timeZone: string;
  /** `#rrggbb`, dark enough to carry white text. */
  brandColor: string;
};

const DEFAULT_SETTINGS: OrganizationSettings = {
  brandColor: "#0f766e",
  emailDomains: [],
  language: "en",
  name: "linkstead",
  timeZone: "UTC"
};

const MAX_NAME = 100;
const MAX_DOMAINS = 20;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** White text on the brand colour must be readable: WCAG AA for normal text. */
const MIN_CONTRAST_WITH_WHITE = 4.5;

const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);

const channel = (value: number): number => {
  const share = value / 255;
  return share <= 0.039_28 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
};

/** The WCAG contrast ratio between a `#rrggbb` colour and white. */
const contrastWithWhite = (hex: string): number => {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  return 1.05 / (luminance + 0.05);
};

const LEADING_AT = /^@/;
const TRAILING_DOT = /\.$/;

/** A domain as it is compared: lowercase, without a leading `@` or a trailing dot. */
const normalizeDomain = (raw: string): string =>
  raw.trim().toLowerCase().replace(LEADING_AT, "").replace(TRAILING_DOT, "");

type SettingsProblem = "bad-name" | "bad-email-domains" | "bad-language" | "bad-time-zone" | "bad-brand-color";

/** Each field's own rule: the value it stores, or undefined when the given one is wrong. */
type FieldRule<K extends keyof OrganizationSettings> = {
  problem: SettingsProblem;
  read: (given: unknown) => OrganizationSettings[K] | undefined;
};

const readName = (given: unknown): string | undefined => {
  const name = typeof given === "string" ? given.trim() : "";
  return name && name.length <= MAX_NAME ? name : undefined;
};

const readDomains = (given: unknown): string[] | undefined => {
  if (!(Array.isArray(given) && given.every((domain) => typeof domain === "string"))) {
    return;
  }
  const domains = [...new Set(given.map(normalizeDomain).filter(Boolean))];
  return domains.length <= MAX_DOMAINS && domains.every((domain) => DOMAIN.test(domain)) ? domains : undefined;
};

/**
 * A zone as it was given, once the runtime knows it. Not in the runtime's own spelling: Workers
 * would turn `Asia/Ho_Chi_Minh` into the older `Asia/Saigon`, which nobody typed.
 */
const readTimeZone = (given: unknown): string | undefined => (isTimeZone(given) ? given.trim() : undefined);

const readColor = (given: unknown): string | undefined => {
  const color = typeof given === "string" ? given.trim().toLowerCase() : "";
  return HEX_COLOR.test(color) && contrastWithWhite(color) >= MIN_CONTRAST_WITH_WHITE ? color : undefined;
};

const RULES: { [K in keyof OrganizationSettings]: FieldRule<K> } = {
  brandColor: { problem: "bad-brand-color", read: readColor },
  emailDomains: { problem: "bad-email-domains", read: readDomains },
  language: { problem: "bad-language", read: (given) => (isLanguage(given) ? given : undefined) },
  name: { problem: "bad-name", read: readName },
  timeZone: { problem: "bad-time-zone", read: readTimeZone }
};

/**
 * Settings as given - in full or in part - laid over the current ones, or the first thing wrong
 * with them. A field left out keeps its current value.
 */
const checkSettings = (
  given: Record<string, unknown>,
  current: OrganizationSettings
): { settings: OrganizationSettings } | { problem: SettingsProblem } => {
  const settings: Record<string, unknown> = { ...current };
  for (const [field, rule] of Object.entries(RULES) as [
    keyof OrganizationSettings,
    FieldRule<keyof OrganizationSettings>
  ][]) {
    if (given[field] === undefined) {
      continue;
    }
    const value = rule.read(given[field]);
    if (value === undefined) {
      return { problem: rule.problem };
    }
    settings[field] = value;
  }
  return { settings: settings as OrganizationSettings };
};

export type { Language, OrganizationSettings, SettingsProblem };
export { checkSettings, contrastWithWhite, DEFAULT_SETTINGS, isLanguage, LANGUAGES, MIN_CONTRAST_WITH_WHITE };
