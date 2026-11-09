// Tests for the single problems on the small test pages: scroll locks, late
// banners, inner scrollers, shadow DOM, iframes, clicks and a strict CSP.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import puppeteer from 'puppeteer';
import { chromium } from 'playwright';
import { captureFullPage } from '../src/capture.js';
import { captureFullPagePuppeteer } from '../src/capture-puppeteer.js';
import { bandColor, imageColor, startTestPageServer } from '../test-page/server.js';
import { near, readPixels } from './pixels.js';

const DARK = '#111827'; // the color of every banner and wall on the small pages

let server;
let playwright;
let chrome;
let baseUrl;

before(async () => {
  server = await startTestPageServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  playwright = await chromium.launch({ chromiumSandbox: true });
  chrome = await puppeteer.launch({ headless: true });
});

after(async () => {
  await playwright?.close();
  await chrome?.close();
  server?.close();
});

// Opens a page in Playwright, runs fn(page), and closes the context.
async function withPlaywright(path, fn) {
  const context = await playwright.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl + path, { waitUntil: 'load' });
    return await fn(page);
  } finally {
    await context.close();
  }
}

// The same for Puppeteer. Options for the context come before the navigation.
async function withPuppeteer(path, fn, { bypassCSP = false } = {}) {
  const context = await chrome.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    if (bypassCSP) await page.setBypassCSP(true);
    await page.goto(baseUrl + path, { waitUntil: 'load' });
    return await fn(page);
  } finally {
    await context.close();
  }
}

// Both libraries run each check, so that the two capture files stay equal.
const libraries = [
  ['Playwright', withPlaywright, captureFullPage],
  ['Puppeteer', withPuppeteer, captureFullPagePuppeteer],
];

for (const [name, withPage, capture] of libraries) {
  test(`${name}: a consent wall that locks the scroll is hidden and the scroll is restored`, async () => {
    await withPage('/consent-wall', async (page) => {
      if (name === 'Playwright') {
        // A plain capture is 4000 px high, but the lower part is empty: the body clips it.
        const plain = await readPixels(await page.screenshot({ fullPage: true }));
        assert.ok(near(plain.at(100, 3500), '#ffffff'), 'a plain capture is white here');
      }
      const result = await capture(page, { bannerWaitMs: 300 });
      assert.equal(result.hidden, 1);
      const image = await readPixels(result.tiles[0]);
      // Without the fix, the image is one viewport (800 px) high.
      assert.equal(image.height, 4000);
      assert.ok(near(image.at(100, 100), bandColor(0)), 'no wall at the top');
      assert.ok(near(image.at(100, 3500), bandColor(3)), 'the last band is there');
    });
  });

  test(`${name}: a banner that comes after the load is hidden`, async () => {
    await withPage('/late-banner', async (page) => {
      // The page adds the banner 700 ms after the load. The wait is 1500 ms.
      const result = await capture(page, { bannerWaitMs: 1_500 });
      assert.equal(result.hidden, 1);
      const image = await readPixels(result.tiles[0]);
      assert.ok(!near(image.at(640, 2000 - 60), DARK) && near(image.at(640, 2000 - 60), bandColor(1)));
    });
  });

  test(`${name}: a page that scrolls inside an element gives the whole element`, async () => {
    await withPage('/inner-scroll', async (page) => {
      // A plain full-page capture is only the viewport high.
      assert.equal((await readPixels(await page.screenshot({ fullPage: true }))).height, 800);
      const result = await capture(page, { bannerWaitMs: 300 });
      assert.equal(result.innerScroller, true);
      const image = await readPixels(result.tiles[0]);
      assert.equal(image.height, 3300);
      assert.ok(near(image.at(100, 1500), bandColor(1)));
      // The lazy image at the end of the element loaded during the scroll.
      assert.ok(near(image.at(20, 3020), imageColor(2)));
    });
  });

  test(`${name}: a banner in an open shadow root is hidden`, async () => {
    await withPage('/shadow', async (page) => {
      const result = await capture(page, { bannerWaitMs: 300 });
      assert.equal(result.hidden, 1);
      const image = await readPixels(result.tiles[0]);
      assert.ok(near(image.at(640, 2000 - 60), bandColor(1)));
    });
  });

  test(`${name}: a consent container inside an iframe is hidden`, async () => {
    await withPage('/frame', async (page) => {
      const result = await capture(page, { bannerWaitMs: 300 });
      assert.equal(result.hidden, 1);
      const image = await readPixels(result.tiles[0]);
      // The iframe is white without the container.
      assert.ok(near(image.at(400, 350), '#ffffff'));
    });
  });

  test(`${name}: acceptConsent clicks only inside the overlay`, async () => {
    await withPage('/consent-click', async (page) => {
      const result = await capture(page, { acceptConsent: true, bannerWaitMs: 300 });
      // The "Accept" link outside the dialog comes first in the page. It was not clicked.
      assert.ok(page.url().endsWith('/consent-click'));
      assert.equal(await page.evaluate(() => document.body.dataset.accepted), 'yes');
      assert.equal(result.hidden, 0);
      const image = await readPixels(result.tiles[0]);
      assert.equal(image.height, 3000);
      assert.ok(near(image.at(640, 1500), '#22c55e'));
    });
  });

  test(`${name}: without acceptConsent nothing is clicked`, async () => {
    await withPage('/consent-click', async (page) => {
      await capture(page, { bannerWaitMs: 300 });
      assert.equal(await page.evaluate(() => document.body.dataset.accepted), undefined);
    });
  });

  test(`${name}: a strict Content Security Policy does not stop the capture`, async () => {
    await withPage('/csp', async (page) => {
      const result = await capture(page, { bannerWaitMs: 300 });
      assert.equal(result.hidden, 1);
      const image = await readPixels(result.tiles[0]);
      assert.equal(image.height, 2000);
      assert.ok(near(image.at(640, 2000 - 60), '#3b82f6'), 'banner hidden');
    });
  });
}

test('Puppeteer: addStyleTag() does not work under a strict Content Security Policy', async () => {
  await withPuppeteer('/csp', async (page) => {
    // Chrome blocks the style element, so Puppeteer reports that the style did not load.
    await assert.rejects(
      page.addStyleTag({ content: '.banner { visibility: hidden !important; }' }),
      /Could not load style/,
    );
    const visibility = await page.evaluate(() => getComputedStyle(document.querySelector('.banner')).visibility);
    assert.equal(visibility, 'visible');
  });
});

test('Puppeteer: setBypassCSP(true) before the navigation makes addStyleTag() work', async () => {
  await withPuppeteer('/csp', async (page) => {
    await page.addStyleTag({ content: '.banner { visibility: hidden !important; }' });
    const visibility = await page.evaluate(() => getComputedStyle(document.querySelector('.banner')).visibility);
    assert.equal(visibility, 'hidden');
  }, { bypassCSP: true });
});

test('Playwright: bypassCSP: true in the context makes addStyleTag() work', async () => {
  const context = await playwright.newContext({ bypassCSP: true });
  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/csp`);
    await page.addStyleTag({ content: '.banner { visibility: hidden !important; }' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.banner')).visibility), 'hidden');
  } finally {
    await context.close();
  }
});
