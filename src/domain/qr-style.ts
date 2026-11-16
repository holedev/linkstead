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

export { DEFAULT_QR_STYLE, isQrStyle, QR_STYLES, type QrStyle };
