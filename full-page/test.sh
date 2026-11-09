#!/usr/bin/env bash
# Install, run the tests, run the script once, print the limits.
set -euo pipefail
cd "$(dirname "$0")"

# npm ci downloads Chrome for Puppeteer. Its install script needs unzip.
command -v unzip > /dev/null || sudo apt-get install -y unzip
npm ci
# Playwright uses the Chromium headless shell. --with-deps also installs the
# system libraries that Chrome for Puppeteer needs.
npx playwright install --with-deps --only-shell chromium
npm test

# The command-line script on the test page: two tiles joined into one PNG.
PORT=8080 node test-page/server.js &
server_pid=$!
trap 'kill "$server_pid" 2> /dev/null || true' EXIT
sleep 1
mkdir -p out
node shoot.js http://127.0.0.1:8080/ out/page.png --join
file out/page.png
file out/page.png | grep -q 'PNG image data, 1280 x 30000'

# The height limits of each browser build on this runner. It only prints them.
node limits.js
