// Measures how tall one full-page screenshot can be in each browser build.
//   node limits.js
// The test page is a stack of 500 px color bands. The script checks the color
// of each band in the image, so it finds repeated or empty parts, not only errors.
import { chromium } from 'playwright';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

const WIDTH = 1280;
const BAND = 500;
const bandColor = (i) => [(i * 53 + 17) % 256, (i * 97 + 29) % 256, (i * 151 + 41) % 256];

const CASES = [
  ['png', 16_384], ['png', 16_385], ['png', 20_000], ['png', 100_000], ['png', 131_072], ['png', 200_000],
  ['webp', 16_383], ['webp', 16_384], ['jpeg', 65_500], ['jpeg', 65_501],
];

function bandsPage(height) {
  let bands = '';
  for (let y = 0, i = 0; y < height; y += BAND, i++) {
    bands += `<div style="height:${Math.min(BAND, height - y)}px;background:rgb(${bandColor(i)})"></div>`;
  }
  return `<body style="margin:0">${bands}</body>`;
}

// Returns the first image row with the wrong color, or null if all rows are right.
async function firstWrongRow(image) {
  const { data, info } = await sharp(image, { limitInputPixels: false })
    .raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y += 4) {
    if (y % BAND < 20 || y % BAND > BAND - 20) continue; // skip band edges (JPEG blur)
    const expected = bandColor(Math.floor(y / BAND));
    const offset = (y * info.width + 10) * info.channels;
    if (expected.some((value, c) => Math.abs(data[offset + c] - value) > 12)) return y;
  }
  return null;
}

async function measure(page, type, height) {
  await page.setContent(bandsPage(height));
  let image;
  try {
    image = Buffer.from(await page.screenshot({ type, fullPage: true }));
  } catch (error) {
    return `error: ${error.message.split('\n')[0]}`;
  }
  if (image.length === 0) return 'empty image (0 bytes), no error';
  const row = await firstWrongRow(image);
  const { height: imageHeight } = await sharp(image, { limitInputPixels: false }).metadata();
  if (row === null) return `complete (${imageHeight} px high)`;
  return `${imageHeight} px high, wrong from row ${row.toLocaleString('en-US')}`;
}

const builds = [
  ['Playwright, Chromium headless shell', async () => {
    const browser = await chromium.launch({ chromiumSandbox: true });
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 800 } });
    return { page: await context.newPage(), browser, version: browser.version() };
  }],
  ["Puppeteer, Chrome (headless: true)", () => launchPuppeteer(true)],
  ["Puppeteer, Chrome headless shell (headless: 'shell')", () => launchPuppeteer('shell')],
];

async function launchPuppeteer(headless) {
  const browser = await puppeteer.launch({ headless });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: 800 });
  return { page, browser, version: await browser.version() };
}

console.log(`Page width ${WIDTH} px, device scale factor 1, fullPage: true\n`);
console.log('| Build | Format | Page height | Result |');
console.log('|---|---|---|---|');
for (const [name, launch] of builds) {
  const { page, browser, version } = await launch();
  try {
    for (const [type, height] of CASES) {
      const result = await measure(page, type, height);
      console.log(`| ${name} ${version} | ${type} | ${height.toLocaleString('en-US')} | ${result} |`);
    }
  } finally {
    await browser.close();
  }
}
