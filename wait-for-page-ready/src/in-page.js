// Functions that run inside the page with page.evaluate(fn, arg). They use only
// browser APIs, so Puppeteer and Playwright can both send them to the page.
// Each function is sent as text, so it cannot use helpers from this file.

// Waits for the load event of the page. Returns false after timeoutMs.
export async function waitForLoadEvent({ timeoutMs }) {
  if (document.readyState === 'complete') return true;
  return new Promise((resolve) => {
    window.addEventListener('load', () => resolve(true), { once: true });
    setTimeout(() => resolve(false), timeoutMs);
  });
}

// Waits until the app says that its data is on the page: an element matches
// readySelector, or window[readyGlobal] is true. Returns false after timeoutMs.
export async function waitForReadySignal({ readySelector, readyGlobal, timeoutMs }) {
  const isReady = () =>
    (!readySelector || document.querySelector(readySelector) !== null) &&
    (!readyGlobal || window[readyGlobal] === true);
  const end = Date.now() + timeoutMs;
  while (!isReady()) {
    if (Date.now() >= end) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

// Waits for the web fonts and for the images in the capture area: the viewport,
// or the whole page when wholePage is true. Returns a list of problems.
export async function waitForFontsAndImages({ timeoutMs, wholePage }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const end = Date.now() + timeoutMs;
  const untilTimeout = (promise) => Promise.race([promise, sleep(Math.max(0, end - Date.now()))]);
  const problems = [];

  // Call this after the app put its content on the page: text that the app
  // adds later can need a font file that is not loaded yet.
  await untilTimeout(document.fonts.ready);
  for (const font of document.fonts) {
    if (font.status === 'loading') problems.push(`font not loaded: ${font.family}`);
    if (font.status === 'error') problems.push(`font failed: ${font.family}`);
  }

  // The images that are in the capture area and have a size.
  const images = [...document.images].filter((img) => {
    const box = img.getBoundingClientRect();
    const inArea = wholePage || (box.bottom > 0 && box.top < window.innerHeight);
    return box.width > 0 && box.height > 0 && inArea;
  });
  let pending = images.length;
  let failed = 0;
  const ready = (img) => {
    // A lazy image far from the viewport does not load on its own.
    if (img.loading === 'lazy') img.loading = 'eager';
    const loaded = img.complete ? Promise.resolve() : new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
    // decode() resolves when the image is ready to draw. It rejects for a broken image.
    return loaded
      .then(() => img.decode())
      .catch(() => failed++)
      .finally(() => pending--);
  };
  await untilTimeout(Promise.all(images.map(ready)));
  if (pending > 0) problems.push(`${pending} of ${images.length} images not loaded`);
  if (failed > 0) problems.push(`${failed} of ${images.length} images failed`);
  return problems;
}

// Ends CSS animations, CSS transitions and Web Animations. A finite animation
// jumps to its end state; an endless one (a spinner) is removed.
export function finishAnimations() {
  const animations = document.getAnimations();
  for (const animation of animations) {
    const end = animation.effect?.getComputedTiming().endTime;
    if (Number.isFinite(end)) animation.finish();
    else animation.cancel();
  }
  return animations.length;
}
