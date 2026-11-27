import qrcode from "qrcode-generator";
import { toBase64 } from "./base64";
import { logoTypeOf } from "./logo";
import {
  DEFAULT_QR_SHAPE,
  DEFAULT_QR_STYLE,
  isLogoScale,
  MAX_LOGO_SCALE,
  QR_STYLES,
  type QrShape,
  type QrStyle
} from "./qr-style";

/**
 * The picture of a QR (CONTEXT.md). The caller passes the Link's address - never the Target - and
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

/** The size of a finder - each of the three large corner squares - in modules. */
const FINDER = 7;

/**
 * A rounded rectangle, in modules from the picture's top-left (quiet zone included). The `dots`
 * shape is made of these alone: a dot is one with a radius of half its side.
 */
type Mark = { x: number; y: number; w: number; h: number; r: number };

/** Where the three finders start, in modules from the symbol's top-left. */
const finderOrigins = (size: number) => [
  [0, 0],
  [0, size - FINDER],
  [size - FINDER, 0]
];

const inFinder = (size: number, row: number, column: number): boolean =>
  finderOrigins(size).some(
    ([top = 0, left = 0]) => row >= top && row < top + FINDER && column >= left && column < left + FINDER
  );

/** A dot slightly smaller than its module, so neighbours stay apart and each reads as one. */
const DOT = 0.9;

/**
 * The `dots` shape as marks, drawn even-odd: each finder is a rounded square, a rounded hole in it
 * and a rounded centre in the hole; every other dark module is a dot.
 */
const dotMarks = (matrix: QrMatrix, hidden: (row: number, column: number) => boolean): Mark[] => {
  const marks: Mark[] = [];
  for (const [top = 0, left = 0] of finderOrigins(matrix.size)) {
    const x = left + QUIET_ZONE;
    const y = top + QUIET_ZONE;
    marks.push(
      { h: 7, r: 2.4, w: 7, x, y },
      { h: 5, r: 1.6, w: 5, x: x + 1, y: y + 1 },
      { h: 3, r: 1.1, w: 3, x: x + 2, y: y + 2 }
    );
  }
  const inset = (1 - DOT) / 2;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.isDark(row, column) && !hidden(row, column) && !inFinder(matrix.size, row, column)) {
        marks.push({ h: DOT, r: DOT / 2, w: DOT, x: column + QUIET_ZONE + inset, y: row + QUIET_ZONE + inset });
      }
    }
  }
  return marks;
};

const round = (value: number): number => Math.round(value * 1000) / 1000;

const markPath = ({ x, y, w, h, r }: Mark): string => {
  const [left, top, width, height, radius] = [x, y, w, h, r].map(round) as [number, number, number, number, number];
  const across = round(width - 2 * radius);
  const down = round(height - 2 * radius);
  const arc = (dx: number, dy: number) => `a${radius} ${radius} 0 0 1 ${dx} ${dy}`;
  return `M${round(left + radius)} ${top}h${across}${arc(radius, radius)}v${down}${arc(-radius, radius)}h${-across}${arc(-radius, -radius)}v${-down}${arc(radius, -radius)}z`;
};

/**
 * A QR as a self-contained SVG: the logo, if any, is inside the file, so the same file gives the
 * same picture wherever it is opened. Bytes that are not PNG or JPEG are left out. `style` sets
 * the colours (`qr-style.ts`); the logo sits on its white backing in every one of them.
 */
const renderQrSvg = (
  text: string,
  logoBytes: Uint8Array | null = null,
  style: QrStyle = DEFAULT_QR_STYLE,
  logoScale = MAX_LOGO_SCALE,
  shape: QrShape = DEFAULT_QR_SHAPE
): string => {
  const type = logoBytes ? logoTypeOf(logoBytes) : null;
  const logo = logoBytes && type ? { bytes: logoBytes, type } : null;
  const colours = QR_STYLES[style];
  const matrix = qrMatrix(text, logo !== null);
  const box = logoBox(matrix.size);
  const end = box.backingStart + box.backing;
  const hidden = (row: number, column: number) =>
    logo !== null && row >= box.backingStart && row < end && column >= box.backingStart && column < end;

  const total = matrix.size + 2 * QUIET_ZONE;
  // The picture shrinks about the box's centre; anything outside the allowed range fills the box.
  const imageSize = (box.logo * (isLogoScale(logoScale) ? logoScale : MAX_LOGO_SCALE)) / 100;
  const imageStart = box.logoStart + QUIET_ZONE + (box.logo - imageSize) / 2;
  const pixels = total * MODULE_PIXELS;
  const background = colours.background
    ? `<rect width="${total}" height="${total}" fill="${colours.background}"/>`
    : "";
  const corner = shape === "dots" ? ' rx="1"' : "";
  const image = logo
    ? `<rect x="${box.backingStart + QUIET_ZONE}" y="${box.backingStart + QUIET_ZONE}" width="${box.backing}" height="${box.backing}"${corner} fill="#fff"/><image x="${imageStart}" y="${imageStart}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid meet" href="data:${logo.type};base64,${toBase64(logo.bytes)}"/>`
    : "";
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixels}" height="${pixels}"`;
  if (shape === "dots") {
    const path = dotMarks(matrix, hidden).map(markPath).join("");
    return `${open}>${background}<path fill="${colours.foreground}" fill-rule="evenodd" d="${path}"/>${image}</svg>`;
  }
  return `${open} shape-rendering="crispEdges">${background}<path fill="${colours.foreground}" d="${darkPath(matrix, hidden)}"/>${image}</svg>`;
};

export { dotMarks, logoBox, type Mark, QUIET_ZONE, qrMatrix, renderQrSvg };
