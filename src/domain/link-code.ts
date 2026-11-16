/**
 * The rules of a Mã link (CONTEXT.md, ADR-0002). Pure, so the UI, the API and the redirect all
 * decide the same way.
 */

const MIN_LENGTH = 3;
const MAX_LENGTH = 50;
const GENERATED_LENGTH = 6;

/** Lowercase unaccented letters, digits and hyphens; no hyphen at either end. */
const CODE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * 32 characters with the look-alikes left out (`0`/`o`, `1`/`l`): a code is retyped from paper.
 * Exactly 32 so that one random byte maps onto it without bias.
 */
const GENERATED_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * The system's own paths. Names of faculties and programmes are data a Quản trị hệ thống keeps,
 * not this list - this one is only what the code itself needs never to be shadowed.
 */
const SYSTEM_RESERVED_CODES: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "health",
  "login",
  "logout",
  "qr",
  "static",
  "www"
]);

type CodeProblem = "too-short" | "too-long" | "bad-characters" | "reserved";

/** What a visitor typed, in the one spelling the system stores: codes match case-insensitively. */
const normalizeCode = (raw: string): string => raw.trim().toLowerCase();

/** Whether a string could be a Mã link at all - the redirect asks this before touching the database. */
const isWellFormedCode = (code: string): boolean =>
  code.length >= MIN_LENGTH && code.length <= MAX_LENGTH && CODE_PATTERN.test(code);

/**
 * Why a code chosen by a person cannot be used, or null when it can. `reserved` is the caller's
 * to extend: pass the Mã dành riêng the administrators keep on top of the system's own.
 */
const checkChosenCode = (raw: string, reserved: ReadonlySet<string> = new Set()): CodeProblem | null => {
  const code = normalizeCode(raw);
  if (code.length < MIN_LENGTH) {
    return "too-short";
  }
  if (code.length > MAX_LENGTH) {
    return "too-long";
  }
  if (!CODE_PATTERN.test(code)) {
    return "bad-characters";
  }
  if (SYSTEM_RESERVED_CODES.has(code) || reserved.has(code)) {
    return "reserved";
  }
  return null;
};

/** A code for a Link whose creator left it blank. The caller retries on the rare collision. */
const generateCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_LENGTH));
  return Array.from(bytes, (byte) => GENERATED_ALPHABET[byte % GENERATED_ALPHABET.length]).join("");
};

export {
  type CodeProblem,
  checkChosenCode,
  GENERATED_ALPHABET,
  generateCode,
  isWellFormedCode,
  normalizeCode,
  SYSTEM_RESERVED_CODES
};
