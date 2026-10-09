#!/usr/bin/env bash
# Build the app and reload the production service (systemd unit: wacrm).
#
# The project builds with `output: "standalone"` (next.config.ts), which
# trims its own copy of node_modules into .next/standalone — but a fresh
# build does NOT carry over the static assets or .env.local into that
# folder. Skipping either step silently leaves the service running last
# time's env vars (no error, just wrong behavior) or a site with missing
# CSS/JS. This script does all of it in the right order and stops at the
# first failure — run it, don't run the steps by hand.
#
# Usage: npm run deploy   (from the repo root, as root — matches how the
# wacrm.service unit and every other service on this VPS runs today).

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "==> 1/5  Building (next build)…"
npm run build

echo "==> 2/5  Copying static assets into the standalone build…"
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static

echo "==> 3/5  Copying public/ into the standalone build…"
rm -rf .next/standalone/public
cp -r public .next/standalone/public

echo "==> 4/5  Copying .env.local into the standalone build…"
cp .env.local .next/standalone/.env.local

echo "==> 5/5  Restarting the wacrm service…"
systemctl restart wacrm

echo "==> Done. Check with: systemctl status wacrm"
