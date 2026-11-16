/**
 * Secrets the system hands out once and then only recognises: a session, a one-time password
 * link, a Khóa API. Only the hash is ever stored, so a leaked database opens nothing.
 */

const SECRET_BYTES = 32;

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

/** A fresh secret. `prefix` names what it is (`oul_` for a Khóa API) so one found in a log is recognisable. */
const newSecret = (prefix = ""): string =>
  `${prefix}${toBase64Url(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)))}`;

/**
 * What is stored in place of a secret. A plain SHA-256 is right here and wrong for a password:
 * these are 256 random bits, so there is nothing to guess and no reason to make hashing slow.
 */
const hashSecret = async (secret: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export { hashSecret, newSecret };
