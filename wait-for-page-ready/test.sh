#!/usr/bin/env bash
# Test entry point: install, run the tests, run the script as the README shows,
# then measure each wait strategy on this runner.
set -euo pipefail
cd "$(dirname "$0")"

# npm ci downloads Chrome for Puppeteer. Its install script needs unzip.
# poppler-utils (pdffonts, pdftoppm) lets the tests and the benchmark read PDF files.
sudo apt-get update -qq
sudo apt-get install -y unzip poppler-utils
npm ci
# Playwright uses the Chromium headless shell. --with-deps also installs the
# system libraries that Chrome for Puppeteer needs.
npx playwright install --with-deps --only-shell chromium
npm test

# The commands of the README: the test page, then the script.
mkdir -p out
npm run test-page > out/test-page.log 2>&1 &
server_pid=$!
trap 'pkill -P "$server_pid" 2> /dev/null || true; kill "$server_pid" 2> /dev/null || true' EXIT
sleep 2
node shoot.js http://127.0.0.1:8080/ dashboard.png --ready-global __READY__ | tee out/shoot.log
grep -q 'Warnings: none' out/shoot.log
file dashboard.png | grep -q 'PNG image data, 1280 x 800'
node shoot.js "http://127.0.0.1:8080/?live=poll" dashboard.png --ready-global __READY__ | tee out/shoot.log
grep -q 'Warnings: none' out/shoot.log
node shoot.js "http://127.0.0.1:8080/?live=poll" dashboard.pdf --ready-global __READY__
head -c 5 dashboard.pdf | grep -q '%PDF-'
pdffonts dashboard.pdf | grep -q DMSerifDisplay
rm dashboard.png dashboard.pdf

# Time and result of each wait strategy (about 15 minutes).
npm run bench
