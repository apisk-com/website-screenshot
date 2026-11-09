// Opens a URL with Puppeteer, waits until the page is ready, and writes a PNG
// screenshot or a PDF file.
//   node shoot.js <url> <file.png|file.pdf> [--ready-selector <css>] [--ready-global <name>]
// Without a ready signal, the script waits at most 3 s for network idle.
import { writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer';
import { waitForPageReady } from './src/wait-for-page-ready.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'ready-selector': { type: 'string' },
    'ready-global': { type: 'string' },
  },
});
const [url, file] = positionals;
const type = extname(file ?? '').toLowerCase();
// Only http and https. If other people send the URL, also add SSRF protection.
if (!url || !['.png', '.pdf'].includes(type) || !/^https?:\/\//.test(url)) {
  console.error('Usage: node shoot.js <http(s) url> <file.png|file.pdf> [--ready-selector <css>] [--ready-global <name>]');
  process.exit(1);
}

const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  // The only hard limit: the HTML document must arrive. The other waits are soft.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  const { warnings, ms } = await waitForPageReady(page, {
    readySelector: values['ready-selector'],
    readyGlobal: values['ready-global'],
    wholePage: type === '.pdf',
  });
  const output = type === '.pdf'
    ? await page.pdf({ format: 'A4', printBackground: true })
    : await page.screenshot({ type: 'png' });
  await writeFile(file, output);
  console.log(`Ready after ${ms} ms. Warnings: ${warnings.length > 0 ? warnings.join('; ') : 'none'}.`);
  console.log(`Wrote ${file}`);
} finally {
  await browser.close();
}
