# Full-page screenshots: lazy images, fixed overlays, tall pages

Code that takes a correct full-page screenshot with Playwright or Puppeteer. It
scrolls the page (or its inner scroll container) so that lazy images load, waits
until the images are decoded, hides cookie banners, consent walls and chat
buttons, also in shadow roots and iframes, stops on a feed without an end, and
captures a tall page in tiles that Chrome can draw. It does not use a style
element, so a strict Content Security Policy does not stop it. A local test page has all
these problems. The tutorial explains each step:
[Full-Page Screenshots: Lazy Images, Sticky Headers, Banners](https://apisk.com/blog/full-page-screenshot/).

## Requirements

- Node.js 22.12 or later
- Chromium for Playwright 1.65 and Chrome for Puppeteer 25.16 (the install steps download them)
- On Linux: the `unzip` command, for the Chrome download of Puppeteer

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

Take a full-page screenshot of it in a second terminal:

```bash
node shoot.js http://127.0.0.1:8080/ page.png --join
```

The script prints the page height, the number of scroll steps and the number of
hidden overlays. It writes one PNG of 1280 x 30000 pixels: the test page
has a feed without an end, so the capture stops at 30,000 CSS pixels.

Other forms:

| Command | Result |
|---|---|
| `node shoot.js <url> page.png` | One PNG, or `page-1.png`, `page-2.png` and so on for a tall page |
| `node shoot.js <url> page.webp` | WebP tiles, each at most 16,000 pixels high |
| `node shoot.js <url> page.png --join` | The tiles joined into one PNG |
| `node shoot.js <url> page.png --naive` | Only `page.screenshot({ fullPage: true })`, to compare |

The script accepts only `http://` and `https://` URLs. It does not block private
network addresses. If other people can send it a URL, add SSRF protection
(SSRF: server-side request forgery).

## Options of captureFullPage

| Option | Default | What it does |
|---|---|---|
| `type`, `quality` | `png` | Image format and quality |
| `maxHeight` | 30000 | Highest point in CSS pixels where the scroll and the image stop |
| `stepDelayMs` | 100 | Wait after each scroll step |
| `imageTimeoutMs` | 5000 | Longest wait for images |
| `bannerWaitMs` | 2000 | How long to look for banners that come late |
| `acceptConsent` | false | Click "accept", but only inside an overlay |
| `hide` | none | More CSS selectors to hide |

## Files

| File | What it does |
|---|---|
| `src/in-page.js` | Functions that run in the page: scroll, wait for images, hide overlays, click accept |
| `src/prepare.js` | The steps before the capture, for both libraries |
| `src/capture.js` | `captureFullPage(page, options)` for Playwright |
| `src/capture-puppeteer.js` | The same for Puppeteer |
| `src/join-tiles.js` | Joins the tiles into one PNG with sharp |
| `shoot.js` | Command-line script with Playwright |
| `limits.js` | Measures the largest screenshot that each browser build draws correctly |
| `test-page/` | The test page and its server |
| `test/` | Tests (`node --test`) |
| `test.sh` | Installs, runs the tests and the script once, and prints the limits |

## Test

```bash
npm test
```

The tests take real screenshots of the test pages and check pixel colors: the
photos, the hidden banner, the header at the top, and the tile sizes. Small
pages test a scroll lock, a late banner, an inner scroller, a shadow root, an
iframe, a click on "accept" and a strict Content Security Policy.

Print the screenshot limits of your browser builds:

```bash
npm run limits
```

## License

MIT. See [LICENSE](../LICENSE).
