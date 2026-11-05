#!/usr/bin/env bash
# One-time setup for the Android project. Run from the frontend folder.
# Requires: Node 18+, JDK 17, Android Studio (with an Android SDK installed).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing dependencies"
npm install

echo "==> Building web assets"
npm run build

if [ ! -d android ]; then
  echo "==> Creating the native Android project"
  npx cap add android
else
  echo "==> android/ already exists, skipping cap add"
fi

echo "==> Syncing web assets and plugins into android/"
npx cap sync android

echo "Done. Open the project in Android Studio with: npm run mobile:open"
