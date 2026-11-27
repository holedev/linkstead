/**
 * The looks a QR may be downloaded in. A fixed list, not a colour picker: each pair below keeps
 * the contrast a phone needs, and a free choice of colours is the easiest way to print a QR that
 * does not scan. The logo always sits on white whatever the look (AGENTS.md).
 *
 * `background: null` is no background at all - the picture takes the colour of what it is printed
 * or placed on, which must then contrast with `foreground` the way the other looks do.
 */

const QR_STYLES = {
  "blue-on-light": { background: "#fff", foreground: "#1b3f8f" },
  "dark-on-clear": { background: null, foreground: "#000" },
  "dark-on-light": { background: "#fff", foreground: "#000" },
  "light-on-clear": { background: null, foreground: "#fff" },
  "light-on-dark": { background: "#000", foreground: "#fff" }
} as const satisfies Record<string, { background: string | null; foreground: string }>;

type QrStyle = keyof typeof QR_STYLES;

const DEFAULT_QR_STYLE: QrStyle = "dark-on-light";

const isQrStyle = (value: unknown): value is QrStyle => typeof value === "string" && Object.hasOwn(QR_STYLES, value);

/**
 * How much of its box a logo may fill, in percent. The box never changes - only the picture in
 * it - so no choice here can cover a module the code needs. Smaller leaves more white round it.
 */
const MIN_LOGO_SCALE = 40;
const MAX_LOGO_SCALE = 100;

const isLogoScale = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= MIN_LOGO_SCALE && (value as number) <= MAX_LOGO_SCALE;

/**
 * How the modules are drawn: `square` as the standard draws them; `dots` as round dots, with the
 * three large corner squares rounded. Kept with each Link, like its logo, so a download later is
 * the same picture. Either reads the same: only the outline of a module changes, not where it is.
 */
const QR_SHAPES = ["square", "dots"] as const;

type QrShape = (typeof QR_SHAPES)[number];

const DEFAULT_QR_SHAPE: QrShape = "square";

const isQrShape = (value: unknown): value is QrShape => QR_SHAPES.includes(value as QrShape);

export {
  DEFAULT_QR_SHAPE,
  DEFAULT_QR_STYLE,
  isLogoScale,
  isQrShape,
  isQrStyle,
  MAX_LOGO_SCALE,
  MIN_LOGO_SCALE,
  QR_SHAPES,
  QR_STYLES,
  type QrShape,
  type QrStyle
};
