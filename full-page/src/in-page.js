// Functions that run inside the page with page.evaluate(fn, arg). They use only
// browser APIs, so Playwright and Puppeteer can both send them to the page.

// Scrolls down one viewport at a time, so that lazy images and lazy sections
// load. Stops at the end of the page or at maxHeight (CSS pixels), because a
// feed without an end grows each time the page scrolls near its end.
// Some pages scroll inside an element, not in the document. Then the document
// is not taller than the viewport, and this function scrolls the tallest
// scrollable element and marks it with data-screenshot-scroller.
export async function scrollThroughPage({ maxHeight, stepDelayMs }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // scrollingElement is null on some pages without a doctype.
  const root = document.scrollingElement ?? document.documentElement;
  let target = root;
  if (root.scrollHeight <= window.innerHeight + 1) {
    for (const element of document.body.querySelectorAll('*')) {
      if (element.scrollHeight <= element.clientHeight + 1) continue;
      if (!['auto', 'scroll'].includes(getComputedStyle(element).overflowY)) continue;
      if (target === root || element.scrollHeight > target.scrollHeight) target = element;
    }
  }
  const inner = target !== root;
  if (inner) target.setAttribute('data-screenshot-scroller', '');

  const viewport = inner ? target.clientHeight : window.innerHeight;
  let y = 0;
  let steps = 0;
  while (y + viewport < Math.min(target.scrollHeight, maxHeight)) {
    y += viewport;
    // 'instant' ignores scroll-behavior: smooth on the page.
    target.scrollTo({ top: y, behavior: 'instant' });
    steps++;
    // Time for scroll handlers and IntersectionObserver callbacks to run.
    await sleep(stepDelayMs);
  }
  // Settle: the last lazy requests start, then the page goes back to the top.
  await sleep(stepDelayMs * 3);
  target.scrollTo({ top: 0, behavior: 'instant' });
  return { steps, inner, pageHeight: target.scrollHeight };
}

// A full-page screenshot is as high as the document. If the page scrolls in an
// element, make that element and its parents as high as their content.
// element.style is not blocked by a Content Security Policy.
export function expandInnerScroller() {
  const scroller = document.querySelector('[data-screenshot-scroller]');
  if (!scroller) return document.documentElement.scrollHeight;
  for (let element = scroller; element; element = element.parentElement) {
    element.style.setProperty('height', 'auto', 'important');
    element.style.setProperty('max-height', 'none', 'important');
    element.style.setProperty('overflow', 'visible', 'important');
  }
  return document.documentElement.scrollHeight;
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

// Selectors of the containers of common consent tools: OneTrust, Cookiebot,
// Didomi, Quantcast, Usercentrics, Google Funding Choices, Sourcepoint, TrustArc.
export const CONSENT_SELECTORS = [
  '#onetrust-consent-sdk', '#onetrust-banner-sdk',
  '#CybotCookiebotDialog',
  '#didomi-host',
  '.qc-cmp2-container',
  '#usercentrics-root',
  '.fc-consent-root',
  '[id^="sp_message_container"]',
  '#truste-consent-track',
];

// Hides what covers the page, with element.style (CSSOM). A page with a strict
// Content Security Policy can block a <style> element, but not element.style.
//   1. Known consent containers (selectors) and, if fixed is true, each element
//      with position: fixed, except a bar at the top of the viewport (a site
//      header). Banners, chat buttons and "back to top" buttons are fixed.
//   2. Scroll locks: a consent wall often sets overflow: hidden on html or body.
// It also looks inside open shadow roots. Call it for each frame of the page.
// Returns the number of elements that it hid in this call.
export function hideOverlays({ selectors, fixed }) {
  let hidden = 0;
  const hide = (element) => {
    if (element.hasAttribute('data-screenshot-hide')) return;
    element.setAttribute('data-screenshot-hide', '');
    element.style.setProperty('visibility', 'hidden', 'important');
    hidden++;
  };

  // The document and each open shadow root.
  const roots = [document];
  for (const root of roots) {
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }

  for (const root of roots) {
    for (const selector of selectors) root.querySelectorAll(selector).forEach(hide);
    if (!fixed) continue;
    for (const element of root.querySelectorAll('*')) {
      if (element === document.body || getComputedStyle(element).position !== 'fixed') continue;
      const box = element.getBoundingClientRect();
      const topBar = box.top <= 0 && box.height <= window.innerHeight / 4;
      if (!topBar) hide(element);
    }
  }

  for (const element of [document.documentElement, document.body]) {
    if (['hidden', 'clip'].includes(getComputedStyle(element).overflowY)) {
      element.style.setProperty('overflow', 'visible', 'important');
    }
  }
  return hidden;
}

// Clicks the "accept" button of a consent dialog, but only a button inside an
// overlay: a fixed or sticky parent, a dialog, or an id or class with "cookie",
// "consent" or "gdpr". A click on any other "Accept" link can leave the page.
// Returns true if it clicked.
export function clickAcceptInOverlay() {
  const label = /^(accept|accept all|accept all cookies|allow all|agree|i agree|got it|ok|okay)$/i;
  const inOverlay = (element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const { position } = getComputedStyle(parent);
      const name = `${parent.id} ${parent.className}`;
      if (position === 'fixed' || position === 'sticky') return true;
      if (parent.matches('dialog, [role="dialog"], [aria-modal="true"]')) return true;
      if (/cookie|consent|gdpr/i.test(name)) return true;
    }
    return false;
  };
  const buttons = document.querySelectorAll('button, [role="button"], input[type="button"], a[href]');
  for (const button of buttons) {
    const text = (button.value || button.textContent).trim();
    if (label.test(text) && inOverlay(button)) {
      button.click();
      return true;
    }
  }
  return false;
}

// Stops CSS transitions and animations, also for Puppeteer, which has no
// animations option. A constructed style sheet is not blocked by a Content
// Security Policy. "transition: none" ends a running transition at its end value.
export function stopMotion() {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('*, *::before, *::after { transition: none !important; animation: none !important; }');
  const roots = [document];
  for (const root of roots) {
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  for (const root of roots) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}
