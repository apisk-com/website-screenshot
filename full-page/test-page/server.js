// Serves the test page and its images on 127.0.0.1, so the examples and the
// tests do not need the internet.
//   /             index.html
//   /img/<n>.svg  a 400 x 300 image, sent after IMAGE_DELAY_MS like a slow network
// Run it alone with: node test-page/server.js (port 8080, or PORT)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const page = readFileSync(new URL('./index.html', import.meta.url));
const IMAGE_DELAY_MS = 150;
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
