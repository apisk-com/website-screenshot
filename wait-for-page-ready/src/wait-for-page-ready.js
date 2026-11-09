// Waits until a page is ready for a screenshot or a PDF. It works with a
// Puppeteer page and with a Playwright page. All waits share one time limit.
// When a wait fails, the function adds a warning and continues, so the caller
// can still capture the page and report the warnings.
import { finishAnimations, waitForFontsAndImages, waitForReadySignal } from './in-page.js';

export async function waitForPageReady(page, {
  readySelector, // CSS selector of an element that the app adds when its data is on the page
  readyGlobal, // name of a window property that the app sets to true, for example '__READY__'
  timeoutMs = 10_000, // the time limit for all waits together
  idleTimeoutMs = 5_000, // without a ready signal: the longest wait for network idle
  wholePage = false, // true: wait for the images of the whole page (full-page screenshot, PDF)
} = {}) {
  const start = Date.now();
  // 1 ms is the minimum: a timeout of 0 means "no time limit" in both libraries.
  const timeLeft = () => Math.max(1, start + timeoutMs - Date.now());
  const warnings = [];

  // 1. The signal of the app. Without one, a short wait for network idle is a guess.
  // There is no wait for the load event: one ad or tracking request that never
  // ends can stop it.
  if (readySelector || readyGlobal) {
    const args = { readySelector, readyGlobal, timeoutMs: timeLeft() };
    if (!(await page.evaluate(waitForReadySignal, args))) warnings.push('no ready signal');
  } else {
    const limit = Math.min(idleTimeoutMs, timeLeft());
    try {
      await waitForNetworkIdle(page, limit);
    } catch {
      warnings.push(`network not idle after ${limit} ms`);
    }
  }

  // 2. Web fonts and images.
  const args = { timeoutMs: timeLeft(), wholePage };
  warnings.push(...(await page.evaluate(waitForFontsAndImages, args)));

  // 3. Animations: show the end state, not a frame in the middle.
  await page.evaluate(finishAnimations);

  return { warnings, ms: Date.now() - start };
}

// No open requests for 500 ms. Puppeteer and Playwright name this wait differently.
async function waitForNetworkIdle(page, timeout) {
  if (typeof page.waitForNetworkIdle === 'function') {
    await page.waitForNetworkIdle({ idleTime: 500, timeout }); // Puppeteer
  } else {
    await page.waitForLoadState('networkidle', { timeout }); // Playwright
  }
}
