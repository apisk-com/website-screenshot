// Functions that run inside the page with page.evaluate(fn, arg). They use only
// browser APIs, so Playwright and Puppeteer can both send them to the page.

// Scrolls down one viewport at a time, so that lazy images and lazy sections
// load. Stops at the end of the page or at maxHeight (CSS pixels), because a
// feed without an end grows each time the page scrolls near its end.
export async function scrollThroughPage({ maxHeight, stepDelayMs }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const step = window.innerHeight;
  let y = 0;
  let steps = 0;
  while (y + window.innerHeight < Math.min(document.documentElement.scrollHeight, maxHeight)) {
    y += step;
    // 'instant' ignores scroll-behavior: smooth on the page.
    window.scrollTo({ top: y, behavior: 'instant' });
    steps++;
    // Time for scroll handlers and IntersectionObserver callbacks to run.
    await sleep(stepDelayMs);
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
  return { steps, pageHeight: document.documentElement.scrollHeight };
}

// Waits until each visible <img> above maxHeight has loaded (or failed) and
// is decoded, or until timeoutMs. Returns the number of images that are not ready.
export async function waitForImages({ maxHeight, timeoutMs }) {
  const images = [...document.images].filter((img) => {
    const box = img.getBoundingClientRect();
    // Skip images with display: none and images below the capture.
    return box.width > 0 && box.top + window.scrollY < maxHeight;
  });
  const ready = (img) => new Promise((resolve) => {
    if (img.complete) return resolve();
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  }).then(() => img.decode().catch(() => {})); // decode() rejects for broken images.

  let pending = images.length;
  const all = Promise.all(images.map((img) => ready(img).then(() => pending--)));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  return pending;
}

// Marks each element with position: fixed, except a bar at the top of the
// viewport (a site header). Cookie banners, chat buttons and "back to top"
// buttons are fixed elements. The screenshot CSS hides the marked elements.
export function markFixedElements() {
  let marked = 0;
  for (const element of document.querySelectorAll('body *')) {
    if (getComputedStyle(element).position !== 'fixed') continue;
    const box = element.getBoundingClientRect();
    const topBar = box.top <= 0 && box.height <= window.innerHeight / 4;
    if (!topBar) {
      element.setAttribute('data-screenshot-hide', '');
      marked++;
    }
  }
  return marked;
}
