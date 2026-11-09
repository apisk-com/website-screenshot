import { chromium } from 'playwright';

// Limits for one screenshot. Change them with environment variables.
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 15_000);
// After the HTML loads, wait at most this long for the network to go idle.
const NETWORK_IDLE_TIMEOUT_MS = Number(process.env.NETWORK_IDLE_TIMEOUT_MS ?? 5_000);
const MAX_OPEN_CONTEXTS = Number(process.env.MAX_OPEN_CONTEXTS ?? 4);
// Full-page screenshots stop at this height (in CSS pixels) to limit memory use.
const MAX_FULL_PAGE_HEIGHT = 10_000;

let browserPromise;
let openContexts = 0;

// One Chromium process for the whole service. Requests share it.
export function getBrowser() {
  browserPromise ??= launchBrowser();
  return browserPromise;
}

async function launchBrowser() {
  try {
    const browser = await chromium.launch({
      // Playwright starts Chromium without its sandbox by default. This service
      // opens pages that it does not control, so it turns the sandbox on.
      chromiumSandbox: process.env.CHROMIUM_SANDBOX !== 'false',
    });
    // If Chromium crashes, the next request starts a new one.
    browser.on('disconnected', () => {
      browserPromise = undefined;
    });
    return browser;
  } catch (error) {
    browserPromise = undefined;
    throw error;
  }
}

export async function closeBrowser() {
  const browser = await browserPromise;
  await browser?.close();
}

// Takes one screenshot and returns the image as a Buffer.
export async function takeScreenshot(options) {
  if (openContexts >= MAX_OPEN_CONTEXTS) {
    throw Object.assign(new Error('Too many screenshots in progress. Try again later.'), {
      status: 503,
      expose: true,
    });
  }
  openContexts++;
  let context;
  try {
    const browser = await getBrowser();
    // A new context for each request: no cookies, storage or cache from other requests.
    context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: options.scale,
    });
    // Applies to page.goto() and page.screenshot().
    context.setDefaultTimeout(RENDER_TIMEOUT_MS);

    const page = await context.newPage();
    // 'domcontentloaded' waits for the HTML only. 'load' also waits for every
    // image, frame and ad, and on some pages it does not come at all.
    const response = await page.goto(options.url, { waitUntil: 'domcontentloaded' });
    // A 403 block page or a 404 page is an answer, but it is not the page.
    const status = response?.status() ?? 200;
    if (status >= 400) {
      throw targetFailed(`The page answered with status ${status}.`, status);
    }

    // Give scripts, images and fonts a short time to finish, then continue.
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch((error) => {
      if (error.name !== 'TimeoutError') throw error;
    });
    // A redirect from a script can end on Chrome's error page after goto().
    if (page.url().startsWith('chrome-error://')) {
      throw targetFailed('The page could not be loaded.');
    }

    return await page.screenshot({
      type: options.format,
      quality: options.quality,
      fullPage: options.fullPage,
      // With fullPage, Playwright cuts this clip to the height of the page.
      clip: options.fullPage
        ? { x: 0, y: 0, width: options.width, height: MAX_FULL_PAGE_HEIGHT }
        : undefined,
    });
  } finally {
    openContexts--;
    // Closes the page too. close() fails when Chromium crashed: keep the first error.
    await context?.close().catch(() => {});
  }
}

// The target page failed. The API answers 502 and names the status of the page.
function targetFailed(message, targetStatus) {
  return Object.assign(new Error(message), { status: 502, expose: true, targetStatus });
}
