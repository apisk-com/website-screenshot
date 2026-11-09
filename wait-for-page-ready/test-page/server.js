// Serves the test page on 127.0.0.1 with fixed delays, like a slow network:
//   /                        index.html (a sales dashboard)
//   /fonts/display.woff2     the heading font, after FONT_DELAY_MS
//   /api/sales               the chart data, after DATA_DELAY_MS
//   /img/product.png         the product photo, after IMAGE_DELAY_MS
//                            (?hang=1: never answers, like a broken image server)
//   /api/live                a long-poll request: open for LIVE_HOLD_MS, then empty
//   /api/events              a server-sent events stream that stays open
//   /pixel.gif               a tracking pixel that never answers
// Run it alone with: node test-page/server.js (port 8080, or PORT)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import sharp from 'sharp';

export const FONT_DELAY_MS = 1_000;
export const DATA_DELAY_MS = 2_000;
export const IMAGE_DELAY_MS = 1_000;
export const LIVE_HOLD_MS = 25_000;

// The colors that the checks look for in the screenshots.
export const BAR_COLOR = '#2563eb';
export const PHOTO_COLOR = '#f97316';

const page = readFileSync(new URL('./index.html', import.meta.url));
const require = createRequire(import.meta.url);
const font = readFileSync(
  require.resolve('@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff2'),
);
// The product photo: a white desk lamp on an orange background.
const lamp = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">
  <g fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round">
    <path d="M250 340 L330 210 L250 120"/>
    <path d="M200 350 H300"/>
  </g>
  <path d="M250 120 L330 70 L390 160 Z" fill="#fff"/>
</svg>`;
const photo = await sharp({
  create: { width: 640, height: 400, channels: 3, background: PHOTO_COLOR },
}).composite([{ input: Buffer.from(lamp) }]).png().toBuffer();

const sales = {
  days: [
    { day: 'Mon', value: 120 }, { day: 'Tue', value: 180 }, { day: 'Wed', value: 150 },
    { day: 'Thu', value: 210 }, { day: 'Fri', value: 260 }, { day: 'Sat', value: 190 },
    { day: 'Sun', value: 90 },
  ],
  product: { name: 'Desk lamp', sold: 312 },
};

function later(ms, fn) {
  setTimeout(fn, ms);
}

export function startTestPageServer(port = 0) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('cache-control', 'no-store');
    switch (url.pathname) {
      case '/':
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.end(page);
      case '/fonts/display.woff2':
        return later(FONT_DELAY_MS, () => {
          res.setHeader('content-type', 'font/woff2');
          res.end(font);
        });
      case '/api/sales':
        return later(DATA_DELAY_MS, () => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(sales));
        });
      case '/img/product.png':
        if (url.searchParams.has('hang')) return; // no answer, the request stays open
        return later(IMAGE_DELAY_MS, () => {
          res.setHeader('content-type', 'image/png');
          res.end(photo);
        });
      case '/api/live':
        return later(LIVE_HOLD_MS, () => {
          res.statusCode = 204;
          res.end();
        });
      case '/api/events':
        res.setHeader('content-type', 'text/event-stream');
        res.write('data: connected\n\n');
        return; // the stream stays open
      case '/pixel.gif':
        return; // no answer: the load event of the page never fires
      default:
        res.statusCode = 404;
        return res.end('Not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const server = await startTestPageServer(Number(process.env.PORT ?? 8080));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Test page on ${base}/`);
  console.log(`With a long-poll connection: ${base}/?live=poll`);
}
