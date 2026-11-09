// Real browsers on the local test page. The checks look at the pixels of each
// screenshot and compare them with a reference capture of the finished page.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright';
import puppeteer from 'puppeteer';
import { checkPdf, checkScreenshot, makePdfReference, makeReference, regionsOf } from '../bench/check.js';
import { waitForPageReady } from '../src/wait-for-page-ready.js';
import { startTestPageServer } from '../test-page/server.js';

const VIEWPORT = { width: 1280, height: 800 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const barsOnPage = (page) => page.evaluate(() => document.querySelectorAll('#chart .bar').length);

let server;
let base;

before(async () => {
  server = await startTestPageServer();
  base = `http://127.0.0.1:${server.address().port}/`;
  await mkdir('out', { recursive: true });
});

after(() => {
  server.closeAllConnections();
  server.close();
});

// The finished page: everything loaded, and 4 seconds more for the animations.
async function reference(page) {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__READY__ === true);
  await sleep(4_000);
  return makeReference(await page.screenshot({ type: 'png' }), await regionsOf(page));
}

describe('Puppeteer', () => {
  let browser;
  let ref;

  before(async () => {
    browser = await puppeteer.launch();
    const page = await newPage();
    ref = await reference(page);
    await page.close();
  });

  after(() => browser.close());

  async function newPage() {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    return page;
  }

  test("waitUntil: 'load' captures the page before the chart and the photo", async () => {
    const page = await newPage();
    await page.goto(base, { waitUntil: 'load' });
    const bars = await barsOnPage(page);
    const problems = await checkScreenshot(await page.screenshot(), ref, bars);
    assert.deepEqual(problems, ['no chart', 'no photo']);
    await page.close();
  });

  test("waitUntil: 'networkidle0' times out on the page with a long-poll request", async () => {
    const page = await newPage();
    await assert.rejects(
      page.goto(`${base}?live=poll`, { waitUntil: 'networkidle0', timeout: 3_000 }),
      { name: 'TimeoutError' },
    );
    await page.close();
  });

  test('waitForPageReady with the ready flag gives a correct screenshot', async () => {
    const page = await newPage();
    await page.goto(`${base}?live=poll`, { waitUntil: 'domcontentloaded' });
    const { warnings } = await waitForPageReady(page, { readyGlobal: '__READY__' });
    assert.deepEqual(warnings, []);
    const bars = await barsOnPage(page);
    assert.deepEqual(await checkScreenshot(await page.screenshot(), ref, bars), []);
    await page.close();
  });

  test('waitForPageReady with a ready selector gives a correct screenshot', async () => {
    const page = await newPage();
    await page.goto(`${base}?live=poll`, { waitUntil: 'domcontentloaded' });
    const { warnings } = await waitForPageReady(page, { readySelector: '#chart .bar' });
    assert.deepEqual(warnings, []);
    const bars = await barsOnPage(page);
    assert.deepEqual(await checkScreenshot(await page.screenshot(), ref, bars), []);
    await page.close();
  });

  test('an image that never loads: a warning, and the capture at the time limit', async () => {
    const page = await newPage();
    await page.goto(`${base}?hang=1`, { waitUntil: 'domcontentloaded' });
    const { warnings, ms } = await waitForPageReady(page, { readyGlobal: '__READY__', timeoutMs: 5_000 });
    assert.deepEqual(warnings, ['1 of 1 images not loaded']);
    assert.ok(ms >= 4_900 && ms < 6_000, `waited ${ms} ms`);
    const png = await page.screenshot();
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    await page.close();
  });

  test('a PDF after waitForPageReady has the font, the chart and the photo', async () => {
    const settled = await newPage();
    await settled.goto(base, { waitUntil: 'load' });
    await settled.waitForFunction(() => window.__READY__ === true);
    await sleep(4_000);
    await writeFile('out/test-reference.pdf', await settled.pdf({ format: 'A4', printBackground: true }));
    const pdfRef = await makePdfReference('out/test-reference.pdf');
    await settled.close();

    const page = await newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const { warnings } = await waitForPageReady(page, { readyGlobal: '__READY__', wholePage: true });
    assert.deepEqual(warnings, []);
    const bars = await barsOnPage(page);
    await writeFile('out/test.pdf', await page.pdf({ format: 'A4', printBackground: true }));
    const file = await readFile('out/test.pdf');
    assert.equal(file.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await PDFDocument.load(file)).getPageCount(), 1);
    assert.deepEqual(await checkPdf('out/test.pdf', pdfRef, bars), []);
    await page.close();
  });
});

describe('Playwright', () => {
  let browser;
  let ref;

  before(async () => {
    browser = await chromium.launch({ chromiumSandbox: true });
    const context = await browser.newContext({ viewport: VIEWPORT });
    ref = await reference(await context.newPage());
    await context.close();
  });

  after(() => browser.close());

  test('waitForPageReady with the ready flag gives a correct screenshot', async () => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${base}?live=poll`, { waitUntil: 'domcontentloaded' });
    const { warnings } = await waitForPageReady(page, { readyGlobal: '__READY__' });
    assert.deepEqual(warnings, []);
    const bars = await barsOnPage(page);
    assert.deepEqual(await checkScreenshot(await page.screenshot(), ref, bars), []);
    await context.close();
  });

  test('without a ready signal: a network warning, and the screenshot is still correct', async () => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${base}?live=poll`, { waitUntil: 'domcontentloaded' });
    const { warnings } = await waitForPageReady(page);
    assert.deepEqual(warnings, ['network not idle after 3000 ms']);
    const bars = await barsOnPage(page);
    assert.deepEqual(await checkScreenshot(await page.screenshot(), ref, bars), []);
    await context.close();
  });

  test("waitUntil: 'networkidle' waits for the photo on the quiet page", async () => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    const bars = await barsOnPage(page);
    assert.deepEqual(await checkScreenshot(await page.screenshot(), ref, bars), []);
    await context.close();
  });
});
