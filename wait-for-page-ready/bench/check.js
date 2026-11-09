// Checks a screenshot or a PDF of the test page against a reference capture,
// taken when everything on the page is done. It looks at the pixels:
//   heading  differs from the reference -> "fallback font"
//   chart    no data on the page -> "no chart"; fewer bar pixels than the
//            reference -> "chart mid-animation" (bars at scale 0 count here too)
//   photo    fewer photo pixels than the reference -> "no photo"
// For a PDF, pdffonts tells if the heading font is in the file, and pdftoppm
// draws page 1 for the color counts (both are in poppler-utils).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { BAR_COLOR, PHOTO_COLOR } from '../test-page/server.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export async function readPixels(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function wholeImage(image) {
  return { x: 0, y: 0, width: image.width, height: image.height };
}

// Counts the pixels in rect that have this color (each channel within 24).
function countColor(image, rect, hex) {
  const [r, g, b] = rgb(hex);
  let count = 0;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const i = (y * image.width + x) * 4;
      const d = image.data;
      if (Math.abs(d[i] - r) <= 24 && Math.abs(d[i + 1] - g) <= 24 && Math.abs(d[i + 2] - b) <= 24) count++;
    }
  }
  return count;
}

// The part of the pixels in rect that differ from the reference image.
function differentPart(image, reference, rect) {
  let different = 0;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const i = (y * image.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        if (Math.abs(image.data[i + c] - reference.data[i + c]) > 40) {
          different++;
          break;
        }
      }
    }
  }
  return different / (rect.width * rect.height);
}

// The boxes of the checked parts of the test page, in CSS pixels.
export function regionsOf(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const b = document.querySelector(selector).getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    };
    return { heading: box('h1'), chart: box('#chart'), photo: box('#product .slot') };
  });
}

export async function makeReference(png, regions) {
  const image = await readPixels(png);
  return {
    image,
    regions,
    bars: countColor(image, regions.chart, BAR_COLOR),
    photo: countColor(image, regions.photo, PHOTO_COLOR),
  };
}

// Returns the problems in a screenshot, or [] when it matches the reference.
// barsOnPage: the number of chart bars in the DOM just before the capture.
export async function checkScreenshot(png, reference, barsOnPage) {
  const image = await readPixels(png);
  const { regions } = reference;
  const problems = [];
  if (differentPart(image, reference.image, regions.heading) > 0.01) problems.push('fallback font');
  const bars = countColor(image, regions.chart, BAR_COLOR);
  if (barsOnPage === 0) problems.push('no chart');
  else if (bars < reference.bars * 0.98) problems.push('chart mid-animation');
  if (countColor(image, regions.photo, PHOTO_COLOR) < reference.photo * 0.95) problems.push('no photo');
  return problems;
}

// Page 1 of a PDF file as PNG pixels (72 dpi), written next to the PDF file.
export async function pdfPage1(file) {
  execFileSync('pdftoppm', ['-png', '-r', '72', '-f', '1', '-l', '1', '-singlefile', file, `${file}-page1`]);
  return readPixels(readFileSync(`${file}-page1.png`));
}

export async function makePdfReference(file) {
  const image = await pdfPage1(file);
  return {
    bars: countColor(image, wholeImage(image), BAR_COLOR),
    photo: countColor(image, wholeImage(image), PHOTO_COLOR),
  };
}

// Returns the problems in a PDF file, or [] when it matches the reference.
export async function checkPdf(file, reference, barsOnPage) {
  const problems = [];
  const fonts = execFileSync('pdffonts', [file]).toString();
  if (!/DMSerifDisplay/i.test(fonts)) problems.push('fallback font');
  const image = await pdfPage1(file);
  const bars = countColor(image, wholeImage(image), BAR_COLOR);
  if (barsOnPage === 0) problems.push('no chart');
  else if (bars < reference.bars * 0.98) problems.push('chart mid-animation');
  if (countColor(image, wholeImage(image), PHOTO_COLOR) < reference.photo * 0.95) problems.push('no photo');
  return problems;
}

export function pdfStartsCorrectly(file) {
  return readFileSync(file).subarray(0, 5).toString() === '%PDF-';
}
