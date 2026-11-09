# Wait until the page is ready before a screenshot or PDF

Code that waits until a web page is ready before Puppeteer or Playwright takes a
screenshot or makes a PDF. `waitForPageReady(page, options)` waits for a ready
signal from the app (or for network idle, at most 5 s), then for web fonts and
images. Then it ends the CSS animations. It does not wait for the load event:
one tracking request that never ends can stop that event. When a wait fails, it adds a
warning and continues, so you still get an image. A local test page has a slow
web font, a chart that loads its data with `fetch()`, a lazy image, a CSS
animation, and variants with requests that never end. A benchmark measures each wait
strategy on this page. The tutorial explains each step:
[Wait Until the Page Is Ready Before a Screenshot or PDF](https://apisk.com/blog/wait-for-page-ready/).

## Requirements

- Node.js 22.12 or later
- Chrome for Puppeteer 25.16 and Chromium for Playwright 1.65 (the install steps download them)
- On Linux: the `unzip` command, for the Chrome download of Puppeteer
- For the PDF checks of the tests and the benchmark: `pdffonts` and `pdftoppm` from poppler-utils

## Install

```bash
npm ci
```

```bash
npx playwright install --only-shell chromium
```

On Linux, add `--with-deps` to the second command to install the system libraries.

## Run

Start the test page in one terminal:

```bash
npm run test-page
```

Take a screenshot of it in a second terminal:

```bash
node shoot.js http://127.0.0.1:8080/ dashboard.png --ready-global __READY__
```

The script prints the wait time and the warnings, and writes a PNG of 1280 x 800 pixels:

```text
Ready after 3021 ms. Warnings: none.
Wrote dashboard.png
```

Other forms:

| Command | Result |
|---|---|
| `node shoot.js "http://127.0.0.1:8080/?live=poll" dashboard.png --ready-global __READY__` | The same page with a request that never ends |
| `node shoot.js <url> dashboard.pdf --ready-global __READY__` | An A4 PDF file |
| `node shoot.js <url> dashboard.png --ready-selector "#chart .bar"` | Waits for an element instead of a global flag |
| `node shoot.js <url> dashboard.png` | No ready signal: waits at most 5 s for network idle |

The script accepts only `http://` and `https://` URLs. It does not block private
network addresses. If other people can send it a URL, add SSRF protection
(SSRF: server-side request forgery).

## The test page

| Part | What the server does |
|---|---|
| Heading font | Sends the web font after 1 s (`font-display: swap`) |
| Chart | Sends the chart data 2 s after the request; the bars grow in 0.8 s |
| Product photo | A lazy image in the card; sent 1 s after the request |
| `?live=poll` | Adds a long-poll request that stays open for 25 s, then starts again |
| `?live=sse` | Adds an `EventSource` stream that stays open |
| `?tracker=1` | Adds a tracking pixel that never arrives, so the `load` event never fires |
| `?hang=1` | The product photo never arrives |

The page sets `window.__READY__ = true` when the chart and the product card are in the DOM.

## Files

| File | What it does |
|---|---|
| `src/in-page.js` | Functions that run in the page: ready signal, fonts, images, animations |
| `src/wait-for-page-ready.js` | `waitForPageReady(page, options)` for Puppeteer and Playwright |
| `shoot.js` | Command-line script with Puppeteer: PNG or PDF |
| `bench/` | The benchmark: the strategies, the pixel checks and the runner |
| `test-page/` | The test page and its server |
| `test/` | Tests (`node --test`) |
| `test.sh` | The script that GitHub Actions runs |

## Test

```bash
npm test
```

The tests take real screenshots and PDF files of the test page and compare
their pixels with a capture of the finished page.

## Measure the wait strategies

```bash
npm run bench
```

The benchmark runs each strategy 5 times on each variant of the test page and
prints Markdown tables: the median time from `page.goto()` to the finished
capture, and what the capture shows. It takes about 15 minutes. `RUNS=3` makes
it faster. `SAVE_IMAGES=1` writes the first screenshot of each strategy to `out/`.

## License

MIT. See [LICENSE](../LICENSE).
