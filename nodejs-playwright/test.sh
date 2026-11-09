#!/usr/bin/env bash
# CI entry point: unit and API tests, then a Docker build and a smoke test.
set -euo pipefail
cd "$(dirname "$0")"

npm ci
# The service needs only the headless shell build of Chromium.
npx playwright install --with-deps --only-shell chromium
npm test

image=screenshot-api-nodejs
container=screenshot-api-nodejs-test
out=$(mktemp -d)

# The local test page on port 8080, as "npm run test-page" starts it.
# The container uses the host network, so it can open it too. setsid gives
# npm and node their own process group, so one kill stops both.
setsid npm run test-page &
pages_pid=$!
api_pid=

cleanup() {
  docker logs "$container" 2>&1 | tail -n 50 || true
  docker rm -f "$container" > /dev/null 2>&1 || true
  if [ -n "$api_pid" ]; then kill -- -"$api_pid" 2> /dev/null || true; fi
  kill -- -"$pages_pid" 2> /dev/null || true
  rm -rf "$out"
}
trap cleanup EXIT

wait_for_health() {
  for _ in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:3000/health > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "The service did not start." >&2
  return 1
}

# The commands of the README and the article: npm start and the curl request.
API_KEY=change-me setsid npm start &
api_pid=$!
wait_for_health
curl -fsS -H "Authorization: Bearer change-me" -o "$out/preview.webp" "http://localhost:3000/screenshot?url=http://127.0.0.1:8080/&width=1200&height=630&format=webp"
file "$out/preview.webp"
file "$out/preview.webp" | grep -q 'Web/P image'
kill -- -"$api_pid"
api_pid=
sleep 2

docker build -t "$image" .
docker image ls "$image"
echo "Node.js in the image: $(docker run --rm "$image" node --version)"

# --init stops Chromium child processes. SYS_ADMIN lets Chromium start its sandbox.
docker run -d --name "$container" --init --cap-add=SYS_ADMIN --network host \
  -e API_KEY=ci-key "$image"

wait_for_health

shot='http://127.0.0.1:3000/screenshot?url=http://127.0.0.1:8080/'

status=$(curl -sS -o /dev/null -w '%{http_code}' "$shot")
if [ "$status" != 401 ]; then
  echo "Expected status 401 without an API key, got $status" >&2
  exit 1
fi

curl -fsS -H 'Authorization: Bearer ci-key' -o "$out/shot.png" "$shot&width=1200&height=630"
file "$out/shot.png"
file "$out/shot.png" | grep -q 'PNG image data, 1200 x 630'

curl -fsS -H 'Authorization: Bearer ci-key' -o "$out/shot.webp" "$shot&format=webp"
file "$out/shot.webp"
file "$out/shot.webp" | grep -q 'Web/P image'

echo "Docker smoke test passed."
