import { api } from "../api";
import { pngOf, save } from "../qr";
import { type ZipEntry, zip } from "./zip";

/**
 * Many QR at once, in one zip, for whoever sends a batch to the printer. Each is the server's SVG
 * with the Link's own logo choice - PNG, as for one QR, is drawn here from that SVG.
 */

type QrFormat = "svg" | "png";

const fileOf = async (code: string, format: QrFormat): Promise<ZipEntry> => {
  const svg = await api.linkQr(code);
  if (format === "svg") {
    return { bytes: new TextEncoder().encode(svg), name: `${code}.svg` };
  }
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const png = await pngOf(url);
    return { bytes: new Uint8Array(await png.arrayBuffer()), name: `${code}.png` };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Fetches the QR one after another - kind to the server - and saves them as one zip. */
const downloadQrZip = async (
  codes: readonly string[],
  format: QrFormat,
  filename: string,
  onProgress: (done: number) => void
): Promise<void> => {
  const entries: ZipEntry[] = [];
  for (const code of codes) {
    entries.push(await fileOf(code, format));
    onProgress(entries.length);
  }
  save(new Blob([zip(entries)], { type: "application/zip" }), filename);
};

export { downloadQrZip, type QrFormat };
