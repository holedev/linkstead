import qrcode from "qrcode-generator";
import { toBase64 } from "./base64";
import { logoTypeOf } from "./logo";

/**
 * The picture of a QR (CONTEXT.md). The caller passes the Link's address - never the Đích - and
 * at most a logo. Size, position and error correction are decided here and nowhere else: nobody
 * can tune them.
 */

/** The blank margin a reader needs around the symbol, in modules. */
const QUIET_ZONE = 4;
/** Pixels per module in the SVG's stated size. The picture is vector; this only sets its default scale. */
const MODULE_PIXELS = 16;
/** White kept clear around the logo, in modules. */
const LOGO_MARGIN = 1;

type QrMatrix = { size: number; isDark: (row: number, column: number) => boolean };

/**
 * The modules of a QR for `text`. With a logo the highest error correction is used, so the part
 * the logo hides can be rebuilt; without one, a medium level keeps the symbol coarse and easy to scan.
 */
const qrMatrix = (text: string, withLogo: boolean): QrMatrix => {
  const code = qrcode(0, withLogo ? "H" : "M");
  code.addData(text, "Byte");
  code.make();
  return { isDark: (row, column) => code.isDark(row, column), size: code.getModuleCount() };
};

/**
 * Where the logo sits, in modules from the symbol's top-left. The logo is the largest odd number
 * of modules within a fifth of the width, so it is centred on whole modules; `backing` is the
 * white square under it.
 */
const logoBox = (size: number) => {
  const fifth = Math.floor(size / 5);
  const logo = fifth % 2 === 1 ? fifth : fifth - 1;
  const backing = logo + 2 * LOGO_MARGIN;
  return { backing, backingStart: (size - backing) / 2, logo, logoStart: (size - logo) / 2 };
};

/** Each run of dark modules in a row as one rectangle, so the file stays small and prints sharp. */
const darkPath = (matrix: QrMatrix, hidden: (row: number, column: number) => boolean): string => {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    let run = 0;
    for (let column = 0; column <= matrix.size; column += 1) {
      const dark = column < matrix.size && matrix.isDark(row, column) && !hidden(row, column);
      if (dark) {
        run += 1;
      } else if (run > 0) {
        parts.push(`M${column - run + QUIET_ZONE} ${row + QUIET_ZONE}h${run}v1h-${run}z`);
        run = 0;
      }
    }
  }
  return parts.join("");
};

/**
 * A QR as a self-contained SVG: the logo, if any, is inside the file, so the same file gives the
 * same picture wherever it is opened. Bytes that are not PNG or JPEG are left out.
 */
const renderQrSvg = (text: string, logoBytes: Uint8Array | null = null): string => {
  const type = logoBytes ? logoTypeOf(logoBytes) : null;
  const logo = logoBytes && type ? { bytes: logoBytes, type } : null;
  const matrix = qrMatrix(text, logo !== null);
  const box = logoBox(matrix.size);
  const end = box.backingStart + box.backing;
  const hidden = (row: number, column: number) =>
    logo !== null && row >= box.backingStart && row < end && column >= box.backingStart && column < end;

  const total = matrix.size + 2 * QUIET_ZONE;
  const pixels = total * MODULE_PIXELS;
  const image = logo
    ? `<image x="${box.logoStart + QUIET_ZONE}" y="${box.logoStart + QUIET_ZONE}" width="${box.logo}" height="${box.logo}" preserveAspectRatio="xMidYMid meet" href="data:${logo.type};base64,${toBase64(logo.bytes)}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixels}" height="${pixels}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path fill="#000" d="${darkPath(matrix, hidden)}"/>${image}</svg>`;
};

export { logoBox, QUIET_ZONE, qrMatrix, renderQrSvg };
