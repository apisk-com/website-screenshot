// Puppeteer tests with Chrome in its default headless mode (headless: true).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import puppeteer from 'puppeteer';
import { captureFullPagePuppeteer } from '../src/capture-puppeteer.js';
import { imageColor, startTestPageServer } from '../test-page/server.js';
import { near, readPixels, testPageLayout } from './pixels.js';

let server;
let browser;
let baseUrl;

before(async () => {
  server = await startTestPageServer();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  browser = await puppeteer.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function withPage(query, fn) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(baseUrl + query, { waitUntil: 'load' });
    return await fn(page);
  } finally {
    await context.close();
  }
}

test('Puppeteer: tiles keep the photos below 16,384 px correct', async () => {
  await withPage('', async (page) => {
    const layout = await testPageLayout(page);
    const result = await captureFullPagePuppeteer(page);
    assert.equal(result.height, 30_000);
    assert.equal(result.hidden, 2);
    const tiles = await Promise.all(result.tiles.map(readPixels));
    assert.deepEqual(tiles.map((tile) => [tile.width, tile.height]), [[1280, 16_000], [1280, 14_000]]);
    layout.photos.forEach((point, i) => {
      assert.ok(near(tiles[1].at(point.x, point.y - 16_000), imageColor(i + 1)), `photo ${i + 1}`);
    });
    assert.ok(near(tiles[0].at(10, 10), '#0f172a'), 'header at the top');
    assert.ok(!near(tiles[0].at(layout.banner.x, layout.banner.y), '#111827'), 'banner hidden');
  });
});

test('Puppeteer: clip and fullPage cannot be used together', async () => {
  await withPage('?tall=0', async (page) => {
    await assert.rejects(
      page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: 100, height: 100 } }),
      /'clip' and 'fullPage' are mutually exclusive/,
    );
  });
});

test('Puppeteer: ElementHandle.screenshot() captures one element', async () => {
  await withPage('?tall=0', async (page) => {
    const header = await page.$('.site-header');
    const image = await readPixels(await header.screenshot());
    assert.deepEqual([image.width, image.height], [1280, 64]);
  });
});
