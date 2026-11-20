#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v timeout || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

node scripts/patch-hgola-framework.mjs
node scripts/build-proxy-wasm.mjs
node scripts/patch-proxy-storage.mjs
node scripts/build-ultraviolet.mjs
node scripts/build-touch-controls.mjs
node scripts/build-geforce-runtime.mjs
node scripts/build-xbox-runtime.mjs
node scripts/build-game-saves.mjs
# Vite's multi-environment build can retain copied public assets. Clear only
# generated output so games removed from source also disappear from deployment.
rm -rf -- "${SITES_PROJECT_ROOT:?}/dist"
echo "Running bounded vinext build..."
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build
node scripts/prune-wallpaper-output.mjs
node scripts/prune-debug-output.mjs

node scripts/compress-game-output.mjs
