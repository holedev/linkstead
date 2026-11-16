/** Bytes as base64 and back, with what Workers, Node and browsers all have. */

const CHUNK = 0x80_00;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
};

/** Null when the text is not base64. */
const fromBase64 = (text: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

export { fromBase64, toBase64 };
