import { normalizeEmail } from "./email";

/**
 * Passwords, for as long as login is self-managed (ADR-0003). The work is split in two:
 *
 * 1. `stretchPassword` runs where the password is typed - in the browser. It is the slow part:
 *    600.000 rounds of PBKDF2, the count OWASP asks of PBKDF2-SHA256.
 * 2. `sealPassword` and `verifyPassword` run on the server, on the result of step 1. They are one
 *    keyed hash each, so signing in costs the server next to nothing - which is what lets it run
 *    within the CPU a request gets on Workers' free plan.
 *
 * Someone who steals the database still has to do step 1 for every guess, so a stored value is as
 * hard to reverse as if the server had done all 600.000 rounds itself. What the browser sends
 * stands in for the password - as the password itself would have - and only ever travels over https.
 *
 * Both steps are Web Crypto, which Workers, Node and browsers all provide (ADR-0001).
 */

const STRETCH_ITERATIONS = 600_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;
const MIN_LENGTH = 12;
const SCHEME = "stretched-hmac-sha256";
/** A 256-bit value in base64: what `stretchPassword` gives and the only thing the server accepts. */
const STRETCHED = /^[A-Za-z0-9+/]{43}=$/;

const encoder = new TextEncoder();
const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

/** Why a new password is refused, or null. Length only: composition rules buy little and annoy. */
const checkNewPassword = (password: string): "too-short" | null => (password.length < MIN_LENGTH ? "too-short" : null);

/**
 * The slow step, done in the browser. Salted with the account's email, which the browser knows
 * before it has signed in, so two people with the same password send different values.
 */
const stretchPassword = async (password: string, email: string): Promise<string> => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = encoder.encode(`ou-link:${normalizeEmail(email)}`);
  const bits = await crypto.subtle.deriveBits(
    { hash: "SHA-256", iterations: STRETCH_ITERATIONS, name: "PBKDF2", salt },
    key,
    KEY_BITS
  );
  return toBase64(new Uint8Array(bits));
};

/** Whether a value has the shape `stretchPassword` gives. A raw password does not. */
const isStretched = (value: string): boolean => STRETCHED.test(value);

const mac = async (stretched: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey("raw", salt, { hash: "SHA-256", name: "HMAC" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, fromBase64(stretched)));
};

/** What is stored: `scheme$salt$hash`. The scheme travels with it so it can be changed later. */
const sealPassword = async (stretched: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return [SCHEME, toBase64(salt), toBase64(await mac(stretched, salt))].join("$");
};

const verifyPassword = async (stretched: string, stored: string): Promise<boolean> => {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== SCHEME || !salt || !hash || !isStretched(stretched)) {
    return false;
  }
  const expected = fromBase64(hash);
  const actual = await mac(stretched, fromBase64(salt));
  if (actual.length !== expected.length) {
    return false;
  }
  // Compared in full, with no early exit, so the time taken says nothing about where they differ.
  let difference = 0;
  for (let i = 0; i < actual.length; i += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: a constant-time comparison is bitwise by nature
    difference |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
  }
  return difference === 0;
};

export { checkNewPassword, isStretched, sealPassword, stretchPassword, verifyPassword };
