// Playwright tests: real screenshots of the local test page.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { captureFullPage } from '../src/capture.js';
import { waitForImages } from '../src/in-page.js';
import { joinTiles } from '../src/join-tiles.js';
import { imageColor, startTestPageServer } from '../test-page/server.js';
import { near, readPixels, testPageLayout } from './pixels.js';

let server;
let browser;
let baseUrl;

before(async () => {
  server = await startTestPageServer();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ chromiumSandbox: true });
});

after(async () => {
  await browser?.close();
  server?.close();
});

// Opens the test page in a new context, runs fn(page) and closes the context.
async function withPage(query, fn, scale = 1) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl + query, { waitUntil: 'load' });
    return await fn(page);
  } finally {
    await context.close();
  }
}

test('fullPage: true alone leaves lazy images empty and puts the banner mid-page', async () => {
  await withPage('?tall=3000', async (page) => {
    const layout = await testPageLayout(page);
    const image = await readPixels(await page.screenshot({ fullPage: true }));
    // loading="lazy": the gray box. IntersectionObserver: no image at all.
    assert.ok(near(image.at(layout.photos[0].x, layout.photos[0].y), '#cbd5e1'));
    assert.ok(near(image.at(layout.photos[6].x, layout.photos[6].y), '#f8fafc'));
    // The banner is at the bottom of the first viewport, not of the page.
    assert.ok(layout.banner.y < 800);
    assert.ok(near(image.at(layout.banner.x, layout.banner.y), '#111827'));
  });
});

test('captureFullPage loads lazy images and hides the fixed overlays', async () => {
  await withPage('?tall=3000', async (page) => {
    const layout = await testPageLayout(page);
    // The feed grows until maxHeight; 10,000 px fit in one tile.
    const result = await captureFullPage(page, { maxHeight: 10_000 });
    assert.equal(result.tiles.length, 1);
    assert.equal(result.hidden, 2);
    assert.equal(result.notReady, 0);
    const image = await readPixels(result.tiles[0]);
    layout.photos.forEach((point, i) => {
      assert.ok(near(image.at(point.x, point.y), imageColor(i + 1)), `photo ${i + 1}`);
    });
    assert.ok(!near(image.at(layout.banner.x, layout.banner.y), '#111827'), 'banner hidden');
    assert.ok(!near(image.at(layout.chat.x, layout.chat.y), '#16a34a'), 'chat button hidden');
    // The sticky header is at the top of the image, after the scroll.
    assert.ok(near(image.at(10, 10), '#0f172a'));
  });
});

test('the scroll stops at maxHeight on a feed without an end', async () => {
  await withPage('', async (page) => {
    const layout = await testPageLayout(page);
    const result = await captureFullPage(page, { maxHeight: 30_000 });
    assert.equal(result.height, 30_000);
    assert.equal(result.cut, true);
    const tiles = await Promise.all(result.tiles.map(readPixels));
    assert.deepEqual(tiles.map((tile) => [tile.width, tile.height]), [[1280, 16_000], [1280, 14_000]]);
    // The photos are below 16,000 px, so they are in the second tile.
    layout.photos.forEach((point, i) => {
      assert.ok(point.y > 16_000);
      assert.ok(near(tiles[1].at(point.x, point.y - 16_000), imageColor(i + 1)), `photo ${i + 1}`);
    });
  });
});

test('the joined tiles are the same image as one capture', async () => {
  await withPage('?tall=12000', async (page) => {
    const result = await captureFullPage(page, { maxHeight: 20_000 });
    assert.equal(result.tiles.length, 2);
    const joined = await readPixels(await joinTiles(result.tiles));
    // One capture of the same area. The Chromium headless shell draws 20,000 px correctly.
    const single = await readPixels(await page.screenshot({
      fullPage: true,
      clip: { x: 0, y: 0, width: 1280, height: 20_000 },
      style: '[data-screenshot-hide] { visibility: hidden !important; }',
      animations: 'disabled',
    }));
    assert.deepEqual([joined.width, joined.height], [1280, 20_000]);
    for (let y = 0; y < 20_000; y += 97) {
      assert.deepEqual(joined.at(640, y), single.at(640, y), `row ${y}`);
    }
  });
});

test('WebP: one capture over 16,383 px fails, tiles work', async () => {
  await withPage('', async (page) => {
    await assert.rejects(page.screenshot({ fullPage: true, type: 'webp' }), /Unable to encode screenshot/);
    const result = await captureFullPage(page, { type: 'webp', quality: 80 });
    for (const tile of result.tiles) {
      assert.equal(tile.subarray(8, 12).toString(), 'WEBP');
    }
    const sizes = await Promise.all(result.tiles.map(readPixels));
    assert.deepEqual(sizes.map((tile) => tile.height), [16_000, 14_000]);
  });
});

test('a device scale factor of 2 gives tiles of 8,000 CSS pixels', async () => {
  await withPage('?tall=3000', async (page) => {
    const result = await captureFullPage(page, { maxHeight: 10_000 });
    const sizes = await Promise.all(result.tiles.map(readPixels));
    assert.deepEqual(sizes.map((tile) => [tile.width, tile.height]), [[2560, 16_000], [2560, 4_000]]);
  }, 2);
});

test('locator.screenshot() captures one element; mask paints over elements', async () => {
  await withPage('?tall=3000', async (page) => {
    const grid = page.locator('.photos').nth(1);
    // The IntersectionObserver loads the images when the grid is in the viewport.
    await grid.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('img.lazy')].every((img) => img.src));
    await page.evaluate(waitForImages, { maxHeight: 1e9, timeoutMs: 5_000 });
    const box = await grid.boundingBox();
    const image = await readPixels(await grid.screenshot({ animations: 'disabled' }));
    // The image covers the whole pixels that the element touches.
    assert.equal(image.width, Math.round(box.width));
    assert.ok(Math.abs(image.height - box.height) <= 1);
    assert.ok(near(image.at(20, 20), imageColor(7)));

    // mask: a box in #FF00FF (the default maskColor) over the chat button.
    const masked = await readPixels(await page.screenshot({ mask: [page.locator('.chat-button')] }));
    assert.ok(near(masked.at(1280 - 24 - 36, 800 - 104 - 12), '#ff00ff'));
  });
});
