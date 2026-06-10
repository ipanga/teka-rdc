#!/usr/bin/env bash
#
# Decode the Android upload keystore + write key.properties for one mobile
# app, from env vars (GitHub Secrets in CI, or your shell locally). Mirrors
# scripts/sync-firebase-secrets.sh. The keystore + key.properties are
# gitignored (apps/*/android/.gitignore) — they must NEVER be committed.
#
# Usage:  scripts/sync-android-signing.sh <buyer|seller>
#
# Inputs (env vars, set before invoking — the CI workflow maps the per-app
# secrets onto these generic names per matrix entry):
#   UPLOAD_KEYSTORE_B64  — base64 of the app's upload keystore (.jks)
#   KEYSTORE_PASSWORD    — keystore (store) password
#   KEY_PASSWORD         — key password (often the same as the store password)
#   KEY_ALIAS            — key alias used when the keystore was generated
#
# Result:
#   apps/<app>-mobile/android/app/upload-keystore.jks
#   apps/<app>-mobile/android/key.properties   (storeFile=upload-keystore.jks ...)
#
# build.gradle.kts loads key.properties when present and signs the release
# build with this key; when absent it falls back to debug signing (so local
# dev + internal-testing APK builds work without the keystore).
set -euo pipefail

app="${1:?usage: sync-android-signing.sh <buyer|seller>}"
case "$app" in
  buyer|seller) ;;
  *) echo "::error::unknown app '$app' (expected buyer|seller)"; exit 1 ;;
esac

: "${UPLOAD_KEYSTORE_B64:?UPLOAD_KEYSTORE_B64 not set}"
: "${KEYSTORE_PASSWORD:?KEYSTORE_PASSWORD not set}"
: "${KEY_PASSWORD:?KEY_PASSWORD not set}"
: "${KEY_ALIAS:?KEY_ALIAS not set}"

dir="apps/${app}-mobile/android"
mkdir -p "$dir/app"

# --decode works on both GNU (CI) and BSD/macOS base64.
if ! printf '%s' "$UPLOAD_KEYSTORE_B64" | base64 --decode > "$dir/app/upload-keystore.jks" 2>/dev/null; then
  echo "::error::failed to base64-decode UPLOAD_KEYSTORE_B64 for $app — is the secret valid?"
  exit 1
fi

cat > "$dir/key.properties" <<EOF
storeFile=upload-keystore.jks
storePassword=${KEYSTORE_PASSWORD}
keyAlias=${KEY_ALIAS}
keyPassword=${KEY_PASSWORD}
EOF

echo "✓ $app: wrote $dir/key.properties + upload-keystore.jks ($(wc -c < "$dir/app/upload-keystore.jks") bytes)"
