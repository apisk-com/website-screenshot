// The same full-page screenshot with Puppeteer. The page functions are the same;
// the differences are in the screenshot options.
import { MAX_TILE_PIXELS } from './capture.js';
import { markFixedElements, scrollThroughPage, waitForImages } from './in-page.js';

export async function captureFullPagePuppeteer(page, {
  type = 'png',
  quality,
  maxHeight = 30_000,
  stepDelayMs = 100,
  imageTimeoutMs = 5_000,
  hide = [],
} = {}) {
  const scroll = await page.evaluate(scrollThroughPage, { maxHeight, stepDelayMs });
  const notReady = await page.evaluate(waitForImages, { maxHeight, timeoutMs: imageTimeoutMs });
  const hidden = await page.evaluate(markFixedElements);

  // Puppeteer has no style or animations option. This CSS stays in the page.
  // "transition: none" ends a running transition at its final value.
  await page.addStyleTag({
    content: `${['[data-screenshot-hide]', ...hide].join(',\n')} { visibility: hidden !important; }
*, *::before, *::after { transition: none !important; animation: none !important; }`,
  });

  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight,
    ratio: window.devicePixelRatio,
  }));
  const height = Math.min(size.height, maxHeight);
  const tileHeight = Math.floor(MAX_TILE_PIXELS / size.ratio);
  const tiles = [];
  for (let y = 0; y < height; y += tileHeight) {
    // Puppeteer does not allow clip together with fullPage. Its default
    // captureBeyondViewport: true reads the clip in page coordinates.
    tiles.push(await page.screenshot({
      type,
      quality,
      clip: { x: 0, y, width: size.width, height: Math.min(tileHeight, height - y) },
    }));
  }
  return { tiles, height, cut: size.height > maxHeight, hidden, notReady, steps: scroll.steps };
}
