// Takes a full-page screenshot of a URL with Playwright.
//   node shoot.js <url> <file.png|file.jpeg|file.webp> [--naive] [--join]
// --naive  only page.screenshot({ fullPage: true }), to compare
// --join   joins the tiles of a tall page into one PNG
// Without --join, a tall page gives file-1.png, file-2.png and so on.
import { writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { captureFullPage } from './src/capture.js';
import { joinTiles } from './src/join-tiles.js';

const TYPES = { '.png': 'png', '.jpeg': 'jpeg', '.jpg': 'jpeg', '.webp': 'webp' };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { naive: { type: 'boolean' }, join: { type: 'boolean' } },
});
const [url, file] = positionals;
// Only http and https. If other people send the URL, also add SSRF protection.
const type = TYPES[extname(file ?? '').toLowerCase()];
if (!url || !type || !/^https?:\/\//.test(url)) {
  console.error('Usage: node shoot.js <http(s) url> <file.png|file.jpeg|file.webp> [--naive] [--join]');
  process.exit(1);
}
if (values.join && type !== 'png') {
  console.error('--join writes PNG only.');
  process.exit(1);
}

const browser = await chromium.launch({ chromiumSandbox: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });

  if (values.naive) {
    await writeFile(file, await page.screenshot({ type, fullPage: true }));
    console.log(`Wrote ${file}`);
  } else {
    const result = await captureFullPage(page, { type });
    console.log(`Page: ${result.height} px${result.cut ? ' (cut at maxHeight)' : ''}, ` +
      `${result.steps} scroll steps, ${result.hidden} fixed elements hidden, ` +
      `${result.notReady} images not ready.`);

    const names = result.tiles.length === 1 || values.join
      ? [file]
      : result.tiles.map((tile, i) => file.replace(/(\.\w+)$/, `-${i + 1}$1`));
    const images = values.join ? [await joinTiles(result.tiles)] : result.tiles;
    for (const [i, image] of images.entries()) {
      await writeFile(names[i], image);
      console.log(`Wrote ${names[i]}`);
    }
  }
} finally {
  await browser.close();
}
