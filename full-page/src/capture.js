// Full-page screenshot with Playwright: loads lazy content, hides fixed
// overlays, and returns the page as one or more image tiles.
import { markFixedElements, scrollThroughPage, waitForImages } from './in-page.js';

// One capture may be at most this many device pixels high. Full Chrome repeats
// the top of the page below 16,384 px, and WebP stops at 16,383 px.
export const MAX_TILE_PIXELS = 16_000;

export async function captureFullPage(page, {
  type = 'png',
  quality,
  maxHeight = 30_000, // CSS pixels: the scroll and the image stop here
  stepDelayMs = 100,
  imageTimeoutMs = 5_000,
  hide = [], // extra CSS selectors to hide, for example a consent dialog
} = {}) {
  // 1. Scroll through the page, so that lazy content loads. Then back to the top.
  const scroll = await page.evaluate(scrollThroughPage, { maxHeight, stepDelayMs });
  const notReady = await page.evaluate(waitForImages, { maxHeight, timeoutMs: imageTimeoutMs });

  // 2. Mark fixed overlays. The style option hides them only during the capture.
  const hidden = await page.evaluate(markFixedElements);
  const style = `${['[data-screenshot-hide]', ...hide].join(',\n')} { visibility: hidden !important; }`;

  // 3. Capture the page in tiles of at most MAX_TILE_PIXELS device pixels.
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight,
    ratio: window.devicePixelRatio,
  }));
  const height = Math.min(size.height, maxHeight);
  const tileHeight = Math.floor(MAX_TILE_PIXELS / size.ratio);
  const tiles = [];
  for (let y = 0; y < height; y += tileHeight) {
    tiles.push(await page.screenshot({
      type,
      quality,
      style,
      animations: 'disabled', // finishes CSS transitions such as a fade-in
      // With fullPage, the clip is in page coordinates, not viewport coordinates.
      fullPage: true,
      clip: { x: 0, y, width: size.width, height: Math.min(tileHeight, height - y) },
    }));
  }
  return { tiles, height, cut: size.height > maxHeight, hidden, notReady, steps: scroll.steps };
}
