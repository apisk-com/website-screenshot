// Reads the pixels of a PNG, JPEG or WebP image for the tests.
import sharp from 'sharp';

export async function readPixels(image) {
  const { data, info } = await sharp(image, { limitInputPixels: false })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    // The color at (x, y) as [r, g, b].
    at(x, y) {
      const offset = (Math.round(y) * info.width + Math.round(x)) * 3;
      return [data[offset], data[offset + 1], data[offset + 2]];
    },
  };
}

// True if the color is near a CSS hex color such as '#ef4444'.
export function near(color, hex, tolerance = 10) {
  const expected = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return color.every((value, i) => Math.abs(value - expected[i]) <= tolerance);
}

// Page positions of the 12 photos (a point near the top left corner, away
// from the label) and of the fixed elements.
export function testPageLayout(page) {
  return page.evaluate(() => {
    const point = (element, dx, dy) => {
      const box = element.getBoundingClientRect();
      return { x: box.left + dx, y: box.top + window.scrollY + dy };
    };
    return {
      photos: [...document.querySelectorAll('.photos img')].map((img) => point(img, 20, 20)),
      banner: point(document.querySelector('.cookie-banner'), 40, 10),
      chat: point(document.querySelector('.chat-button'), 36, 60),
    };
  });
}
