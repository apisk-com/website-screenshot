// Full-page screenshot with Playwright: loads lazy content, hides overlays,
// and returns the page as one or more image tiles.
import { preparePage } from './prepare.js';

// One capture is at most this many device pixels high. WebP stops at 16,383 px,
// and full Chrome on a Mac repeated the top of the page after 16,384 px.
export const MAX_TILE_PIXELS = 16_000;

export async function captureFullPage(page, {
  type = 'png',
  quality,
  maxHeight = 30_000, // CSS pixels: the scroll and the image stop here
  stepDelayMs = 100,
  imageTimeoutMs = 5_000,
  bannerWaitMs = 2_000, // how long to look for banners that come late
  acceptConsent = false, // click "accept" in a consent dialog
  hide = [], // extra CSS selectors to hide, for example a consent dialog
} = {}) {
  // 1. Scroll, wait for images and hide overlays (src/prepare.js).
  const { size, scroll, notReady, hideAgain, hiddenCount } = await preparePage(page, {
    maxHeight, stepDelayMs, imageTimeoutMs, bannerWaitMs, acceptConsent, hide,
  });

  // 2. Capture the page in tiles of at most MAX_TILE_PIXELS device pixels.
  const height = Math.min(size.height, maxHeight);
  const tileHeight = Math.floor(MAX_TILE_PIXELS / size.ratio);
  const tiles = [];
  for (let y = 0; y < height; y += tileHeight) {
    await hideAgain();
    tiles.push(await page.screenshot({
      type,
      quality,
      animations: 'disabled', // finishes CSS transitions such as a fade-in
      // With fullPage, the clip is in page coordinates, not viewport coordinates.
      fullPage: true,
      clip: { x: 0, y, width: size.width, height: Math.min(tileHeight, height - y) },
    }));
  }
  return {
    tiles, height, cut: size.height > maxHeight, notReady,
    hidden: hiddenCount(), steps: scroll.steps, innerScroller: scroll.inner,
  };
}
