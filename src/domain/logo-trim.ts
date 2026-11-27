/**
 * Where the logo itself sits inside an uploaded picture. A logo file often carries a wide white or
 * transparent margin; in the QR's fixed logo box that margin is wasted, and the logo looks tiny.
 * The box sits on white already, so a near-white or near-transparent pixel is margin, not logo.
 *
 * Pure, on RGBA pixels, so the browser's canvas does the decoding and this decides.
 */

type Box = { x: number; y: number; width: number; height: number };

/** Lighter than this on every channel reads as white paper. */
const WHITE = 245;
/** Less opaque than this reads as nothing. */
const CLEAR = 16;
/** Breathing room kept round the logo, as a share of its larger side. */
const MARGIN = 0.04;

const isMargin = (pixels: Uint8ClampedArray, at: number): boolean => {
  const alpha = pixels[at + 3] ?? 0;
  if (alpha < CLEAR) {
    return true;
  }
  return (pixels[at] ?? 0) >= WHITE && (pixels[at + 1] ?? 0) >= WHITE && (pixels[at + 2] ?? 0) >= WHITE;
};

/**
 * The part of a `width` x `height` picture worth keeping, with a thin margin, kept within the
 * picture. Null when there is nothing to trim - no margin, or nothing but margin.
 */
const contentBox = (pixels: Uint8ClampedArray, width: number, height: number): Box | null => {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isMargin(pixels, (y * width + x) * 4)) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) {
    return null;
  }
  const pad = Math.round(Math.max(right - left + 1, bottom - top + 1) * MARGIN);
  const box = {
    height: Math.min(height - 1, bottom + pad) - Math.max(0, top - pad) + 1,
    width: Math.min(width - 1, right + pad) - Math.max(0, left - pad) + 1,
    x: Math.max(0, left - pad),
    y: Math.max(0, top - pad)
  };
  return box.width === width && box.height === height ? null : box;
};

export { type Box, contentBox };
