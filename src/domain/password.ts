/**
 * Passwords, for as long as login is self-managed (ADR-0003).
 *
 * PBKDF2 through Web Crypto, because it is the one password hash both Cloudflare Workers and Node
 * provide natively - anything else is a WebAssembly dependency that would have to move with the
 * system (ADR-0001). 100.000 iterations is the most the Workers runtime accepts for PBKDF2.
 */

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const MIN_LENGTH = 12;
const SCHEME = "pbkdf2-sha256";

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const derive = async (password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ hash: "SHA-256", iterations, name: "PBKDF2", salt }, key, KEY_BITS);
  return new Uint8Array(bits);
};

/** Why a new password is refused, or null. Length only: composition rules buy little and annoy. */
const checkNewPassword = (password: string): "too-short" | null => (password.length < MIN_LENGTH ? "too-short" : null);

/** `scheme$iterations$salt$hash` - the parameters travel with the hash so they can be raised later. */
const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return [SCHEME, ITERATIONS, toBase64(salt), toBase64(hash)].join("$");
};

const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== SCHEME || !iterations || !salt || !hash) {
    return false;
  }
  const expected = fromBase64(hash);
  const actual = await derive(password, fromBase64(salt), Number(iterations));
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

export { checkNewPassword, hashPassword, verifyPassword };
