#!/usr/bin/env bash
set -euo pipefail
npm ci
npm test
npm run build
npx cap sync android
mkdir -p android/.signing
if [ -n "${ANDROID_KEYSTORE_BASE64:-}" ]; then
  printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > android/.signing/team.jks
else
  keytool -genkeypair -keystore android/.signing/team.jks -storepass android -keypass android -alias team -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=OmniView Contributors Team Test' -noprompt
fi
cd android
chmod +x gradlew
./gradlew assembleRelease lintRelease --no-daemon
cp app/build/outputs/apk/release/app-release.apk ../OmniView-Contributors.apk
