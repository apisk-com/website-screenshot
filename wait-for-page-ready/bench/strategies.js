// The wait strategies that the benchmark measures. Each one opens the URL and
// returns when the strategy says that the page is ready.
import { waitForPageReady } from '../src/wait-for-page-ready.js';

const READY = '#chart .bar';

export const puppeteerStrategies = [
  { name: "goto, waitUntil: 'domcontentloaded'", run: (page, url) => page.goto(url, { waitUntil: 'domcontentloaded' }) },
  { name: "goto, waitUntil: 'load'", run: (page, url) => page.goto(url, { waitUntil: 'load' }) },
  { name: "goto, waitUntil: 'networkidle2'", idle: true, run: (page, url) => page.goto(url, { waitUntil: 'networkidle2' }) },
  { name: "goto, waitUntil: 'networkidle0'", idle: true, run: (page, url) => page.goto(url, { waitUntil: 'networkidle0' }) },
  {
    name: "load, then page.waitForNetworkIdle()",
    idle: true,
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForNetworkIdle();
    },
  },
  {
    name: "load, then document.fonts.ready",
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready.then(() => true));
    },
  },
  {
    name: `load, then waitForSelector('${READY}')`,
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForSelector(READY);
    },
  },
  {
    name: 'load, then waitForFunction(window.__READY__)',
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__READY__ === true);
    },
  },
  {
    name: "waitForPageReady({ readyGlobal: '__READY__' })",
    helper: true,
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return waitForPageReady(page, { readyGlobal: '__READY__' });
    },
  },
  {
    name: 'waitForPageReady() without a ready signal',
    helper: true,
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return waitForPageReady(page);
    },
  },
];

export const playwrightStrategies = [
  { name: "goto, waitUntil: 'domcontentloaded'", run: (page, url) => page.goto(url, { waitUntil: 'domcontentloaded' }) },
  { name: "goto, waitUntil: 'load'", run: (page, url) => page.goto(url, { waitUntil: 'load' }) },
  { name: "goto, waitUntil: 'networkidle'", idle: true, run: (page, url) => page.goto(url, { waitUntil: 'networkidle' }) },
  {
    name: `load, then locator('${READY}').first().waitFor()`,
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'load' });
      await page.locator(READY).first().waitFor();
    },
  },
  {
    name: 'load, then waitForFunction(window.__READY__)',
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__READY__ === true);
    },
  },
  {
    name: "the same, plus screenshot animations: 'disabled'",
    screenshot: { animations: 'disabled' },
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__READY__ === true);
    },
  },
  {
    name: "waitForPageReady({ readyGlobal: '__READY__' })",
    helper: true,
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return waitForPageReady(page, { readyGlobal: '__READY__' });
    },
  },
  {
    name: 'waitForPageReady() without a ready signal',
    helper: true,
    run: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return waitForPageReady(page);
    },
  },
];
