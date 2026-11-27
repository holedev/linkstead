import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { checkLogo, logoTypeOf, MAX_LOGO_BYTES } from "./logo";
import { dotMarks, logoBox, type Mark, QUIET_ZONE, qrMatrix, renderQrSvg } from "./qr";
import { isLogoScale, isQrStyle, QR_STYLES, type QrStyle } from "./qr-style";

const LINK = "https://go.example.org/hoi-thao-khoa-hoc-quoc-te-2027";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const RECT = /M(\d+) (\d+)h(\d+)v1h-\d+z/g;
const SCALE = 8;
const MODULES = /<path fill="#[0-9a-f]+" d="([^"]*)"/;
const IMAGE = /<image x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/;
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

  it("carries the same code under any logo, so a QR printed with one logo outlives a change to another", () => {
    const OTHER_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6]);
    const modules = (svg: string) => svg.match(MODULES)?.[1];
    const withA = renderQrSvg(LINK, PNG);
    const withB = renderQrSvg(LINK, OTHER_PNG);

    expect(withA).not.toBe(withB);
    expect(modules(withA)).toBe(modules(withB));
    const box = logoBox(qrMatrix(LINK, true).size);
    expect(scan(withA, { size: box.logo, start: box.logoStart })).toBe(LINK);
    expect(scan(withB, { size: box.logo, start: box.logoStart })).toBe(LINK);
  });

  it("shrinks the logo about the centre of its box, which stays the same size", () => {
    const box = logoBox(qrMatrix(LINK, true).size);
    const imageOf = (scale?: number) =>
      (renderQrSvg(LINK, PNG, "dark-on-light", scale).match(IMAGE) ?? []).slice(1).map(Number);
    const full = imageOf();
    const half = imageOf(50);

    expect(full).toEqual([box.logoStart + QUIET_ZONE, box.logoStart + QUIET_ZONE, box.logo, box.logo]);
    expect(half[2]).toBe(box.logo / 2);
    expect((half[0] ?? 0) + (half[2] ?? 0) / 2).toBe((full[0] ?? 0) + (full[2] ?? 0) / 2);
    // The white backing, and so the modules left showing, do not change with the logo's size.
    const backing = (svg: string) => svg.slice(0, svg.indexOf("<image"));
    expect(backing(renderQrSvg(LINK, PNG, "dark-on-light", 40))).toBe(backing(renderQrSvg(LINK, PNG)));
    // Out of range means filling the box, never more.
    expect(imageOf(250)).toEqual(full);
    expect(imageOf(10)).toEqual(full);
  });

  it("knows the sizes a logo may take", () => {
    expect([40, 70, 100].every(isLogoScale)).toBe(true);
    expect([39, 101, 55.5, Number.NaN].some(isLogoScale)).toBe(false);
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
    for (const text of ["https://go.example.org/abc", LINK, `${LINK}-${"x".repeat(40)}`]) {
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

/** Whether a point lies inside a rounded rectangle. */
const inMark = (mark: Mark, px: number, py: number): boolean => {
  if (px < mark.x || px > mark.x + mark.w || py < mark.y || py > mark.y + mark.h) {
    return false;
  }
  const cx = Math.min(Math.max(px, mark.x + mark.r), mark.x + mark.w - mark.r);
  const cy = Math.min(Math.max(py, mark.y + mark.r), mark.y + mark.h - mark.r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= mark.r ** 2;
};

/** Paints the dots shape even-odd, as an SVG renderer does, and reads it back as a phone would. */
const scanDots = (text: string, withLogo: boolean): string | null => {
  const matrix = qrMatrix(text, withLogo);
  const box = logoBox(matrix.size);
  const end = box.backingStart + box.backing;
  const hidden = (row: number, column: number) =>
    withLogo && row >= box.backingStart && row < end && column >= box.backingStart && column < end;
  const marks = dotMarks(matrix, hidden);
  const total = matrix.size + 2 * QUIET_ZONE;
  const width = total * SCALE;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = (x + 0.5) / SCALE;
      const py = (y + 0.5) / SCALE;
      const inside = marks.filter((mark) => inMark(mark, px, py)).length;
      const inLogo =
        withLogo &&
        px >= box.logoStart + QUIET_ZONE &&
        px < box.logoStart + QUIET_ZONE + box.logo &&
        py >= box.logoStart + QUIET_ZONE &&
        py < box.logoStart + QUIET_ZONE + box.logo;
      if (inside % 2 === 1 || inLogo) {
        pixels.fill(inLogo ? 40 : 0, (y * width + x) * 4, (y * width + x) * 4 + 3);
      }
    }
  }
  return jsQR(pixels, width, width)?.data ?? null;
};

describe("the dots shape", () => {
  it("reads back as the same Link, with or without a logo over the middle", () => {
    expect(scanDots(LINK, false)).toBe(LINK);
    expect(scanDots(LINK, true)).toBe(LINK);
    expect(scanDots("https://go.test/abc", true)).toBe("https://go.test/abc");
  });

  it("draws a dot where the square shape draws a module, and rounds the three finders", () => {
    const matrix = qrMatrix(LINK, false);
    const marks = dotMarks(matrix, () => false);
    const finders = marks.filter((mark) => mark.w > 1);
    expect(finders).toHaveLength(9);
    let modules = 0;
    for (let row = 0; row < matrix.size; row += 1) {
      for (let column = 0; column < matrix.size; column += 1) {
        modules += matrix.isDark(row, column) ? 1 : 0;
      }
    }
    // Each finder has 33 dark modules: a ring of 24 and a centre of 9.
    expect(marks.length - finders.length).toBe(modules - 3 * 33);
  });

  it("is still only shapes and an embedded image, and keeps the logo on a rounded white backing", () => {
    const svg = renderQrSvg(LINK, PNG, "dark-on-light", 100, "dots");
    expect(svg).not.toMatch(ANYTHING_ACTIVE);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('rx="1" fill="#fff"');
    expect(svg).not.toContain("crispEdges");
  });
});
