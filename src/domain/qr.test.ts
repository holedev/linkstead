import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { checkLogo, logoTypeOf, MAX_LOGO_BYTES } from "./logo";
import { logoBox, QUIET_ZONE, qrMatrix, renderQrSvg } from "./qr";
import { isQrStyle, QR_STYLES, type QrStyle } from "./qr-style";

const LINK = "https://go.ou.edu.vn/hoi-thao-khoa-hoc-quoc-te-2027";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const RECT = /M(\d+) (\d+)h(\d+)v1h-\d+z/g;
const SCALE = 8;
const VIEW_BOX = /viewBox="0 0 (\d+)/;
const BACKGROUND = /^<svg[^>]*><rect width="\d+" height="\d+" fill="(#[0-9a-f]+)"\/>/;
const FOREGROUND = /<path fill="(#[0-9a-f]+)"/;
const ANYTHING_ACTIVE = /<script|<a |<foreignObject|on\w+=|href="(?!data:image\/(png|jpeg);base64,)/;

/** Paints the SVG's rectangles onto a pixel grid, as a printer would, and reads it back as a phone would. */
const scan = (svg: string, whiteBox?: { start: number; size: number }): string | null => {
  const total = Number(svg.match(VIEW_BOX)?.[1]);
  const width = total * SCALE;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  const paint = (x: number, y: number, w: number, h: number, shade: number) => {
    for (let py = y * SCALE; py < (y + h) * SCALE; py += 1) {
      for (let px = x * SCALE; px < (x + w) * SCALE; px += 1) {
        pixels.fill(shade, (py * width + px) * 4, (py * width + px) * 4 + 3);
      }
    }
  };
  for (const [, x, y, run] of svg.matchAll(RECT)) {
    paint(Number(x), Number(y), Number(run), 1, 0);
  }
  if (whiteBox) {
    // The worst logo for a reader: a solid dark square where the logo goes.
    paint(whiteBox.start + QUIET_ZONE, whiteBox.start + QUIET_ZONE, whiteBox.size, whiteBox.size, 40);
  }
  return jsQR(pixels, width, width)?.data ?? null;
};

const rgbOf = (hex: string): [number, number, number] => {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}` : hex;
  return [1, 3, 5].map((at) => Number.parseInt(full.slice(at, at + 2), 16)) as [number, number, number];
};

/**
 * Paints the SVG in its own colours on a surface - the paper, or the wall a clear QR is placed on
 * - and reads it back as a phone would, trying the picture both ways round as phones do.
 */
const scanInColour = (svg: string, surface: string): string | null => {
  const total = Number(svg.match(VIEW_BOX)?.[1]);
  const width = total * SCALE;
  const pixels = new Uint8ClampedArray(width * width * 4);
  const paint = (x: number, y: number, w: number, h: number, hex: string) => {
    const [r, g, b] = rgbOf(hex);
    for (let py = y * SCALE; py < (y + h) * SCALE; py += 1) {
      for (let px = x * SCALE; px < (x + w) * SCALE; px += 1) {
        pixels.set([r, g, b, 255], (py * width + px) * 4);
      }
    }
  };
  paint(0, 0, total, total, svg.match(BACKGROUND)?.[1] ?? surface);
  const foreground = svg.match(FOREGROUND)?.[1] ?? "#000";
  for (const [, x, y, run] of svg.matchAll(RECT)) {
    paint(Number(x), Number(y), Number(run), 1, foreground);
  }
  return jsQR(pixels, width, width, { inversionAttempts: "attemptBoth" })?.data ?? null;
};

/**
 * Where each look is meant to go: a clear one takes the colour of what it is placed on. White on
 * clear is tried on black because that is what it needs - on a mid blue or grey a reader already
 * starts to miss it, which is why the UI asks for a really dark surface.
 */
const SURFACE: Record<QrStyle, string> = {
  "blue-on-light": "#808080",
  "dark-on-clear": "#fff",
  "dark-on-light": "#808080",
  "light-on-clear": "#000",
  "light-on-dark": "#808080"
};

describe("the looks of a QR", () => {
  it("reads back as the same Link in every look, on the surface it is meant for", () => {
    for (const style of Object.keys(QR_STYLES) as QrStyle[]) {
      expect([style, scanInColour(renderQrSvg(LINK, null, style), SURFACE[style])]).toEqual([style, LINK]);
    }
  });

  it("leaves the background out of a clear look, and draws one in every other", () => {
    expect(renderQrSvg(LINK, null, "dark-on-clear")).not.toMatch(BACKGROUND);
    expect(renderQrSvg(LINK, null, "light-on-clear")).not.toMatch(BACKGROUND);
    expect(renderQrSvg(LINK, null, "light-on-dark").match(BACKGROUND)?.[1]).toBe("#000");
    expect(renderQrSvg(LINK)).toBe(renderQrSvg(LINK, null, "dark-on-light"));
  });

  it("keeps the logo on white in every look", () => {
    const box = logoBox(qrMatrix(LINK, true).size);
    const backing = `<rect x="${box.backingStart + QUIET_ZONE}" y="${box.backingStart + QUIET_ZONE}" width="${box.backing}" height="${box.backing}" fill="#fff"/>`;
    for (const style of Object.keys(QR_STYLES) as QrStyle[]) {
      expect(renderQrSvg(LINK, PNG, style)).toContain(backing);
    }
  });

  it("knows only its own looks", () => {
    expect(isQrStyle("light-on-dark")).toBe(true);
    expect(isQrStyle("hot-pink")).toBe(false);
    expect(isQrStyle("toString")).toBe(false);
    expect(isQrStyle(undefined)).toBe(false);
  });
});

describe("renderQrSvg", () => {
  it("carries exactly the text it was given", () => {
    expect(scan(renderQrSvg(LINK))).toBe(LINK);
  });

  it("still reads with a logo over its centre", () => {
    const svg = renderQrSvg(LINK, PNG);
    const box = logoBox(qrMatrix(LINK, true).size);
    expect(scan(svg, { size: box.logo, start: box.logoStart })).toBe(LINK);
  });

  it("raises error correction to the highest level only when a logo is present", () => {
    // A higher level needs more modules for the same text.
    expect(qrMatrix(LINK, true).size).toBeGreaterThan(qrMatrix(LINK, false).size);
    expect(renderQrSvg(LINK, SVG)).toBe(renderQrSvg(LINK));
  });

  it("keeps the logo centred, on a white backing, within a fifth of the width", () => {
    for (const text of ["https://go.ou.edu.vn/abc", LINK, `${LINK}-${"x".repeat(40)}`]) {
      const { size } = qrMatrix(text, true);
      const box = logoBox(size);
      expect(box.logo).toBeLessThanOrEqual(size / 5);
      expect(box.logo).toBeGreaterThanOrEqual(3);
      expect(box.logoStart * 2 + box.logo).toBe(size);
      expect(box.backing).toBe(box.logo + 2);
    }
    const svg = renderQrSvg(LINK, JPEG);
    expect(svg).toContain('href="data:image/jpeg;base64,/9j/4AAQ"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("puts nothing in the picture but rectangles and an embedded image", () => {
    const svg = renderQrSvg(LINK, PNG);
    expect(svg).not.toMatch(ANYTHING_ACTIVE);
  });
});

describe("an uploaded logo", () => {
  it("is PNG or JPEG by its bytes, and never SVG", () => {
    expect(logoTypeOf(PNG)).toBe("image/png");
    expect(logoTypeOf(JPEG)).toBe("image/jpeg");
    expect(checkLogo(SVG)).toBe("not-png-or-jpeg");
    expect(checkLogo(new Uint8Array())).toBe("empty");
  });

  it("has a size limit", () => {
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set(PNG);
    expect(checkLogo(big)).toBe("too-large");
    expect(checkLogo(big.subarray(0, MAX_LOGO_BYTES))).toBeNull();
  });
});
