import { describe, expect, it } from "vitest";
import { contentBox } from "./logo-trim";

type Pixel = [number, number, number, number];
const WHITE: Pixel = [255, 255, 255, 255];
const CLEAR: Pixel = [0, 0, 0, 0];
const BLUE: Pixel = [27, 63, 143, 255];

/** A `width` x `height` picture of `background` with a `fill` rectangle at (x, y). */
const picture = (
  width: number,
  height: number,
  background: Pixel,
  rect?: { x: number; y: number; w: number; h: number; fill: Pixel }
) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      pixels.set(inside ? rect.fill : background, (y * width + x) * 4);
    }
  }
  return pixels;
};

describe("finding the logo inside its picture", () => {
  it("keeps the logo and a thin margin, dropping the white round it", () => {
    // A 50 x 20 logo in the middle of a 200 x 200 white picture: 4% of 50 is 2 pixels of margin.
    const pixels = picture(200, 200, WHITE, { fill: BLUE, h: 20, w: 50, x: 75, y: 90 });
    expect(contentBox(pixels, 200, 200)).toEqual({ height: 24, width: 54, x: 73, y: 88 });
  });

  it("treats a transparent margin as white", () => {
    const pixels = picture(100, 100, CLEAR, { fill: BLUE, h: 10, w: 10, x: 0, y: 45 });
    expect(contentBox(pixels, 100, 100)).toEqual({ height: 10, width: 10, x: 0, y: 45 });
  });

  it("leaves alone a picture with no margin, and one with nothing in it", () => {
    expect(contentBox(picture(10, 10, BLUE), 10, 10)).toBeNull();
    expect(contentBox(picture(10, 10, WHITE), 10, 10)).toBeNull();
    expect(contentBox(picture(10, 10, CLEAR), 10, 10)).toBeNull();
  });

  it("counts a near-white speck as margin, and a light grey as logo", () => {
    const speck = picture(40, 40, WHITE, { fill: [250, 250, 250, 255], h: 2, w: 2, x: 1, y: 1 });
    expect(contentBox(speck, 40, 40)).toBeNull();
    const grey = picture(40, 40, WHITE, { fill: [230, 230, 230, 255], h: 10, w: 10, x: 15, y: 15 });
    expect(contentBox(grey, 40, 40)).toEqual({ height: 10, width: 10, x: 15, y: 15 });
  });
});
