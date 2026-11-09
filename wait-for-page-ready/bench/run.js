// Measures each wait strategy on the test page: the time from page.goto() to
// the finished image or PDF, and what the capture shows.
//   npm run bench               5 runs per strategy (RUNS=3 for a faster run)
//   SAVE_IMAGES=1 npm run bench also writes the first screenshot of each strategy to out/
// It prints Markdown tables and writes all runs to out/bench.json.
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import puppeteer from 'puppeteer';
import { startTestPageServer } from '../test-page/server.js';
import { checkPdf, checkScreenshot, makePdfReference, makeReference, regionsOf } from './check.js';
import { playwrightStrategies, puppeteerStrategies } from './strategies.js';

const RUNS = Number(process.env.RUNS ?? 5);
const PDF_RUNS = Math.min(RUNS, 3);
const TIMEOUT_MS = 10_000;
const VIEWPORT = { width: 1280, height: 800 };
const require = createRequire(import.meta.url);

const libraries = [
  {
    name: 'Puppeteer',
    version: require('puppeteer/package.json').version,
    strategies: puppeteerStrategies,
    launch: () => puppeteer.launch(),
    async newPage(browser) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport(VIEWPORT);
      page.setDefaultTimeout(TIMEOUT_MS);
      page.setDefaultNavigationTimeout(TIMEOUT_MS);
      return { page, close: () => context.close() };
    },
  },
  {
    name: 'Playwright',
    version: require('playwright/package.json').version,
    strategies: playwrightStrategies,
    launch: () => chromium.launch({ chromiumSandbox: true }),
    async newPage(browser) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      context.setDefaultTimeout(TIMEOUT_MS);
      context.setDefaultNavigationTimeout(TIMEOUT_MS);
      return { page: await context.newPage(), close: () => context.close() };
    },
  },
];

const server = await startTestPageServer();
const base = `http://127.0.0.1:${server.address().port}/`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await mkdir('out', { recursive: true });

// One run: open a new context, wait with the strategy, capture, check.
async function runOnce(library, browser, strategy, url, capture) {
  const { page, close } = await library.newPage(browser);
  try {
    const start = performance.now();
    let result;
    try {
      result = await strategy.run(page, url);
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
      return { ms: performance.now() - start, timeout: true, error: error.message.split('\n')[0] };
    }
    const waitMs = performance.now() - start;
    const output = await capture(page, strategy);
    return { ms: performance.now() - start, waitMs, ...output, warnings: result?.warnings ?? [] };
  } finally {
    await close();
  }
}

// The reference: everything loaded, and 4 seconds more for the animations.
async function settledPage(library, browser) {
  const { page, close } = await library.newPage(browser);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__READY__ === true);
  await sleep(4_000);
  return { page, close };
}

function summarize(runs) {
  const times = runs.map((run) => run.ms).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const counts = new Map();
  for (const run of runs) {
    const text = run.timeout ? `TimeoutError after ${TIMEOUT_MS / 1000} s`
      : run.problems.length ? run.problems.join(', ') : 'correct';
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const result = [...counts].map(([text, n]) => (counts.size > 1 ? `${text} (${n}/${runs.length})` : text)).join('; ');
  const warnings = [...new Set(runs.flatMap((run) => run.warnings ?? []))];
  const errors = [...new Set(runs.flatMap((run) => run.error ?? []))];
  const captures = runs.filter((run) => run.captureMs !== undefined).map((run) => run.captureMs).sort((a, b) => a - b);
  const capture = captures.length ? `${(captures[Math.floor(captures.length / 2)] / 1000).toFixed(2)} s` : '-';
  return { time: `${(median / 1000).toFixed(2)} s`, capture, result, warnings, errors };
}

const results = { runs: RUNS, pdfRuns: PDF_RUNS, environment: {}, screenshots: [], eventSource: [], pdf: [] };
results.environment = {
  os: `${os.type()} ${os.release()} ${os.arch()}`,
  cpus: `${os.cpus().length} x ${os.cpus()[0]?.model}`,
  node: process.version,
};

for (const library of libraries) {
  const browser = await library.launch();
  results.environment[library.name] = `${library.version}, browser ${await browser.version()}`;

  // Screenshot reference.
  const settled = await settledPage(library, browser);
  const reference = await makeReference(await settled.page.screenshot({ type: 'png' }), await regionsOf(settled.page));
  // PDF reference.
  await writeFile('out/reference.pdf', await settled.page.pdf({ format: 'A4', printBackground: true }));
  const pdfReference = await makePdfReference('out/reference.pdf');
  await settled.close();

  // Only for the labels: is the chart data on the page? The pixels decide the rest.
  const barsOnPage = (page) => page.evaluate(() => document.querySelectorAll('#chart .bar').length);
  const screenshot = async (page, strategy, file) => {
    const bars = await barsOnPage(page);
    const start = performance.now();
    const png = await page.screenshot({ type: 'png', ...strategy.screenshot });
    const captureMs = performance.now() - start;
    if (file && process.env.SAVE_IMAGES) await writeFile(file, png);
    return { captureMs, problems: await checkScreenshot(png, reference, bars) };
  };
  const pdf = async (page) => {
    const bars = await barsOnPage(page);
    const start = performance.now();
    await writeFile('out/run.pdf', await page.pdf({ format: 'A4', printBackground: true }));
    const captureMs = performance.now() - start;
    return { captureMs, problems: await checkPdf('out/run.pdf', pdfReference, bars) };
  };

  for (const [index, strategy] of library.strategies.entries()) {
    const row = { library: library.name, strategy: strategy.name };
    for (const [key, query] of [['quiet', ''], ['longPoll', '?live=poll']]) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        const file = i === 0 ? `out/${library.name.toLowerCase()}-${index + 1}-${key}.png` : null;
        runs.push(await runOnce(library, browser, strategy, base + query, (page, s) => screenshot(page, s, file)));
      }
      row[key] = { ...summarize(runs), runs };
    }
    results.screenshots.push(row);
    console.error(`${library.name}: ${strategy.name}: ${row.quiet.time} ${row.quiet.result} | ${row.longPoll.time} ${row.longPoll.result}`);

    if (strategy.idle) {
      const runs = [];
      for (let i = 0; i < PDF_RUNS; i++) runs.push(await runOnce(library, browser, strategy, `${base}?live=sse`, screenshot));
      results.eventSource.push({ library: library.name, strategy: strategy.name, ...summarize(runs), runs });
    }
    if (!strategy.screenshot) {
      const runs = [];
      for (let i = 0; i < PDF_RUNS; i++) runs.push(await runOnce(library, browser, strategy, base, pdf));
      results.pdf.push({ library: library.name, strategy: strategy.name, ...summarize(runs), runs });
    }
  }
  await browser.close();
}
server.closeAllConnections();
server.close();
await writeFile('out/bench.json', JSON.stringify(results, null, 2));

// Markdown tables.
const env = results.environment;
const lines = [
  `Runner: ${env.os}, ${env.cpus}, Node.js ${env.node}`,
  `Puppeteer ${env.Puppeteer}; Playwright ${env.Playwright}`,
  `Median of ${RUNS} runs for screenshots, ${PDF_RUNS} runs for EventSource and PDF. Time: page.goto() to the finished capture.`,
  '',
  '| Library | Wait | Quiet page: time | Quiet page: result | Long-poll page: time | Long-poll page: result |',
  '|---|---|---|---|---|---|',
  ...results.screenshots.map((r) => `| ${r.library} | \`${r.strategy}\` | ${r.quiet.time} | ${r.quiet.result} | ${r.longPoll.time} | ${r.longPoll.result} |`),
  '',
  '| Library | Wait | EventSource page: time | Result |',
  '|---|---|---|---|',
  ...results.eventSource.map((r) => `| ${r.library} | \`${r.strategy}\` | ${r.time} | ${r.result} |`),
  '',
  '| Library | Wait before pdf() | Time | Result |',
  '|---|---|---|---|',
  ...results.pdf.map((r) => `| ${r.library} | \`${r.strategy}\` | ${r.time} | ${r.result} |`),
  '',
  'Median time of the capture call alone (screenshot or pdf):',
  ...results.screenshots.map((r) => `- ${r.library}, ${r.strategy}: quiet ${r.quiet.capture}, long-poll ${r.longPoll.capture}`),
  ...results.pdf.map((r) => `- PDF ${r.library}, ${r.strategy}: ${r.capture}`),
  '',
  'Timeout errors:',
  ...[...results.screenshots.flatMap((r) => [...r.quiet.errors, ...r.longPoll.errors].map((e) => `${r.library}: ${e}`)),
    ...results.eventSource.flatMap((r) => r.errors.map((e) => `${r.library}: ${e}`))]
    .filter((e, i, all) => all.indexOf(e) === i).map((e) => `- ${e}`),
  '',
  'Warnings from waitForPageReady():',
  ...results.screenshots.filter((r) => r.strategy.startsWith('waitForPageReady'))
    .map((r) => `- ${r.library}, ${r.strategy}: quiet [${r.quiet.warnings.join('; ')}], long-poll [${r.longPoll.warnings.join('; ')}]`),
];
const markdown = lines.join('\n');
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, { flag: 'a' });
