import { fromBase64, toBase64 } from "./base64";

/**
 * A Link's password (ADR-0006): a word a Unit shares with the people it means to let through -
 * printed beside a QR for a class, sent with a link to reviewers. Not a person's password, and not
 * a lock on anything secret: the Target itself is still an address anybody may know.
 *
 * Stored as PBKDF2-SHA256 with a salt of its own and few enough rounds to fit a Worker's CPU
 * limit; guessing is slowed where it matters, at the door, by a limit on wrong tries per minute.
 */

const MIN_LINK_PASSWORD = 4;
const MAX_LINK_PASSWORD = 100;
const ROUNDS = 10_000;
const SALT_BYTES = 16;
const PREFIX = "pbkdf2-sha256";

type PasswordProblem = "too-short" | "too-long";

const checkLinkPassword = (password: string): PasswordProblem | null => {
  if (password.length < MIN_LINK_PASSWORD) {
    return "too-short";
  }
  return password.length > MAX_LINK_PASSWORD ? "too-long" : null;
};

const derive = async (password: string, salt: Uint8Array, rounds: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { hash: "SHA-256", iterations: rounds, name: "PBKDF2", salt: new Uint8Array(salt) },
    key,
    256
  );
  return new Uint8Array(bits);
};

/** What is kept for a password: the scheme, the rounds, the salt and the hash, `$`-separated. */
const hashLinkPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return [PREFIX, ROUNDS, toBase64(salt), toBase64(await derive(password, salt, ROUNDS))].join("$");
};

/** Whether `password` is the one `stored` was made from. Compares every byte, whatever differs. */
const matchesLinkPassword = async (password: string, stored: string): Promise<boolean> => {
  const [prefix, rounds, salt, hash] = stored.split("$");
  const saltBytes = salt ? fromBase64(salt) : null;
  const expected = hash ? fromBase64(hash) : null;
  if (prefix !== PREFIX || !(saltBytes && expected) || !Number.isInteger(Number(rounds))) {
    return false;
  }
  const actual = await derive(password, saltBytes, Number(rounds));
  if (actual.length !== expected.length) {
    return false;
  }
  let same = true;
  for (let index = 0; index < actual.length; index += 1) {
    same = actual[index] === expected[index] && same;
  }
  return same;
};

export { checkLinkPassword, hashLinkPassword, MAX_LINK_PASSWORD, MIN_LINK_PASSWORD, matchesLinkPassword };
