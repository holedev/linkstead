/**
 * What an uploaded logo may be: PNG or JPEG, told by its first bytes and never by what the upload
 * says it is. Never SVG - it can carry script and would come back under the university's domain.
 */

type LogoType = "image/png" | "image/jpeg";

/** Room for a sharp logo at print size; a QR shows it at a fifth of its width at most. */
const MAX_LOGO_BYTES = 256 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  bytes.length > signature.length && signature.every((byte, index) => bytes[index] === byte);

/** The type the bytes really are, or null when they are neither PNG nor JPEG. */
const logoTypeOf = (bytes: Uint8Array): LogoType | null => {
  if (startsWith(bytes, PNG)) {
    return "image/png";
  }
  return startsWith(bytes, JPEG) ? "image/jpeg" : null;
};

type LogoProblem = "empty" | "too-large" | "not-png-or-jpeg";

const checkLogo = (bytes: Uint8Array): LogoProblem | null => {
  if (bytes.length === 0) {
    return "empty";
  }
  if (bytes.length > MAX_LOGO_BYTES) {
    return "too-large";
  }
  return logoTypeOf(bytes) ? null : "not-png-or-jpeg";
};

export { checkLogo, type LogoProblem, type LogoType, logoTypeOf, MAX_LOGO_BYTES };
