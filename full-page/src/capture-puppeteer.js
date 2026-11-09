// The same full-page screenshot with Puppeteer. The steps before the capture are
// the same; the differences are in the screenshot options.
import { MAX_TILE_PIXELS } from './capture.js';
import { stopMotion } from './in-page.js';
import { preparePage } from './prepare.js';

export async function captureFullPagePuppeteer(page, {
  type = 'png',
  quality,
  maxHeight = 30_000,
  stepDelayMs = 100,
  imageTimeoutMs = 5_000,
  bannerWaitMs = 2_000,
  acceptConsent = false,
  hide = [],
} = {}) {
  const { size, scroll, notReady, hideAgain, hiddenCount } = await preparePage(page, {
    maxHeight, stepDelayMs, imageTimeoutMs, bannerWaitMs, acceptConsent, hide,
  });
  // Puppeteer has no animations option. This does not use addStyleTag(), which a
  // strict Content Security Policy can block.
  await page.evaluate(stopMotion);

  const height = Math.min(size.height, maxHeight);
  const tileHeight = Math.floor(MAX_TILE_PIXELS / size.ratio);
  const tiles = [];
  for (let y = 0; y < height; y += tileHeight) {
    await hideAgain();
    // Puppeteer does not allow clip together with fullPage. Its default
    // captureBeyondViewport: true reads the clip in page coordinates.
    tiles.push(await page.screenshot({
      type,
      quality,
      clip: { x: 0, y, width: size.width, height: Math.min(tileHeight, height - y) },
    }));
  }
  return {
    tiles, height, cut: size.height > maxHeight, notReady,
    hidden: hiddenCount(), steps: scroll.steps, innerScroller: scroll.inner,
  };
}
