// Serves the test page and its images on 127.0.0.1, so the examples and the
// tests do not need the internet.
//   /             index.html
//   /img/<n>.svg  a 400 x 300 image, sent after IMAGE_DELAY_MS like a slow network
//   /consent-wall  a consent wall; html and body have height 100% and overflow: hidden
//   /consent-click a consent dialog with an Accept button, and an Accept link outside it
//   /late-banner   a cookie banner that appears 700 ms after the load
//   /inner-scroll  a page that scrolls inside an element, not in the document
//   /shadow        a banner inside an open shadow root
//   /frame         a consent container inside an iframe
//   /csp           a page with a strict Content Security Policy
// Run it alone with: node test-page/server.js (port 8080, or PORT)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const page = readFileSync(new URL('./index.html', import.meta.url));
const IMAGE_DELAY_MS = 150;
const BAND_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7'];
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6'];

// The fill color of image n. The tests look for it in the screenshots.
export function imageColor(n) {
  return COLORS[(n - 1) % COLORS.length];
}

function imageSvg(n) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="${imageColor(n)}"/>
  <text x="200" y="165" font-family="sans-serif" font-size="40" fill="#fff" text-anchor="middle">Photo ${n}</text>
</svg>`;
}

// Bands of 1000 px, each in its own color: bandColor(i) is the color of band i.
export const bandColor = (i) => BAND_COLORS[i % BAND_COLORS.length];
const bands = (count) => Array.from({ length: count }, (_, i) =>
  `<div style="height:1000px;background:${bandColor(i)}"></div>`).join('');
const BANNER = 'position:fixed;left:0;right:0;bottom:0;height:120px;background:#111827;z-index:9';

// Small pages for single problems. Each one is plain HTML.
const PAGES = {
  '/consent-wall': `<!doctype html><style>html,body{height:100%;margin:0;overflow:hidden}</style><body>${bands(4)}
    <div id="onetrust-consent-sdk" style="position:fixed;inset:0;background:#111827;z-index:9"></div></body>`,
  '/consent-click': `<body style="margin:0;overflow:hidden">
    <a href="/elsewhere" style="position:absolute;top:0;left:0">Accept</a>
    <div style="height:3000px;background:#22c55e"></div>
    <div class="cookie-consent" style="position:fixed;inset:0;background:#111827;z-index:9">
      <button id="accept" type="button" onclick="document.body.style.overflow='auto';this.parentElement.remove();document.body.dataset.accepted='yes'">Accept all</button>
    </div></body>`,
  '/elsewhere': '<body>Another page</body>',
  '/late-banner': `<body style="margin:0">${bands(2)}
    <script>setTimeout(() => {
      const banner = document.createElement('div');
      banner.style.cssText = '${BANNER}';
      document.body.append(banner);
    }, 700);</script></body>`,
  '/inner-scroll': `<body style="margin:0;height:100%;overflow:hidden"><style>html{height:100%}</style>
    <div id="app" style="height:100%;overflow-y:auto">${bands(2)}
      <div style="height:1000px;background:#eab308"></div>
      <img loading="lazy" src="/img/2.svg" width="400" height="300" alt="" style="display:block">
    </div></body>`,
  '/shadow': `<body style="margin:0">${bands(2)}<div id="host"></div>
    <script>document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML =
      '<div style="${BANNER}"></div>';</script></body>`,
  '/frame': `<body style="margin:0">${bands(2)}
    <iframe src="/frame-content" style="position:absolute;left:100px;top:200px;width:600px;height:300px;border:0"></iframe></body>`,
  '/frame-content': `<body style="margin:0;background:#fff">
    <div id="onetrust-banner-sdk" style="position:fixed;inset:0;background:#111827"></div></body>`,
};

export function startTestPageServer(port = 0) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const image = path.match(/^\/img\/(\d{1,3})\.svg$/);
    if (image) {
      setTimeout(() => {
        res.setHeader('content-type', 'image/svg+xml');
        res.end(imageSvg(Number(image[1])));
      }, IMAGE_DELAY_MS);
      return;
    }
    if (path === '/csp') {
      // No inline script, no inline style, no style element. Only files from this server.
      res.setHeader('content-security-policy', "default-src 'none'; style-src 'self'; img-src 'self'");
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end('<link rel="stylesheet" href="/csp.css"><div class="band"></div><div class="banner"></div>');
    }
    if (path === '/csp.css') {
      res.setHeader('content-type', 'text/css');
      return res.end(`body { margin: 0; }
.band { height: 2000px; background: #3b82f6; }
.banner { ${BANNER} }`);
    }
    if (PAGES[path]) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(PAGES[path]);
    }
    if (path === '/') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(page);
    }
    res.statusCode = 404;
    res.end('Not found');
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const server = await startTestPageServer(Number(process.env.PORT ?? 8080));
  console.log(`Test page on http://127.0.0.1:${server.address().port}/`);
}
