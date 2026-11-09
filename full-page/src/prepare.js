// The steps before the capture, for Playwright and Puppeteer. Both pages have
// the same evaluate(fn, arg) and frames() methods, so one file serves both.
import {
  CONSENT_SELECTORS, clickAcceptInOverlay, expandInnerScroller, hideOverlays,
  scrollThroughPage, waitForImages,
} from './in-page.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hides the overlays in the page and, for known consent containers, in each
// iframe. Returns the number of elements that it hid.
async function hideEverywhere(page, selectors) {
  let hidden = await page.evaluate(hideOverlays, { selectors, fixed: true });
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    // A frame can go away during the call. Skip it then.
    hidden += await frame.evaluate(hideOverlays, { selectors, fixed: false }).catch(() => 0);
  }
  return hidden;
}

export async function preparePage(page, { maxHeight, stepDelayMs, imageTimeoutMs, bannerWaitMs, acceptConsent, hide }) {
  const selectors = [...CONSENT_SELECTORS, ...hide];

  // 1. A consent dialog first: a click can remove it and unlock the scroll.
  if (acceptConsent && await page.evaluate(clickAcceptInOverlay)) await sleep(300);
  let hidden = await hideEverywhere(page, selectors);

  // 2. Scroll through the page (or through its inner scroller), then back to the top.
  const scroll = await page.evaluate(scrollThroughPage, { maxHeight, stepDelayMs });
  if (scroll.inner) await page.evaluate(expandInnerScroller);
  const notReady = await page.evaluate(waitForImages, { maxHeight, timeoutMs: imageTimeoutMs });

  // 3. Late banners: look again for bannerWaitMs, at the top of the page.
  for (const end = Date.now() + bannerWaitMs; ; await sleep(250)) {
    hidden += await hideEverywhere(page, selectors);
    if (Date.now() >= end) break;
  }

  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight,
    ratio: window.devicePixelRatio,
  }));
  // hideAgain() runs before each tile: a banner can come while the tiles are captured.
  const hideAgain = async () => { hidden += await hideEverywhere(page, selectors); };
  return { size, scroll, notReady, hideAgain, hiddenCount: () => hidden };
}
