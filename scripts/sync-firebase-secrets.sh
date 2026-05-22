#!/usr/bin/env bash
#
# Decode the Firebase/APNs credentials from base64-encoded GitHub
# Secrets and drop them at the gitignored paths the apps expect at
# build time. Safe to run anywhere — locally if you want to bootstrap
# a fresh checkout from your `~/.zshrc`-loaded secrets, or in CI from
# `secrets.*`.
#
# Inputs (set as env vars before invoking):
#   BUYER_GOOGLE_SERVICES_JSON_B64   — base64 of buyer-mobile/android/app/google-services.json
#   SELLER_GOOGLE_SERVICES_JSON_B64  — base64 of seller-mobile/android/app/google-services.json
#
# Future inputs once iOS scaffold lands (PR C):
#   BUYER_GOOGLE_SERVICE_INFO_PLIST_B64
#   SELLER_GOOGLE_SERVICE_INFO_PLIST_B64
#   APNS_AUTH_KEY_P8_B64
#
# Backend FCM auth is handled separately via the discrete
# `FIREBASE_PROJECT_ID` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL`
# env trio that PushService reads at boot — no file decoding needed
# there. See docs/push-notifications.md § "Backend auth" for the
# rationale.
#
# Behaviour
# - Each variable is optional. If unset, the corresponding file is
#   skipped (the script doesn't fail). This lets dev machines keep
#   using local credential files without setting the env vars.
# - Existing files are overwritten without warning.
# - Directory creation is `mkdir -p`, idempotent.
# - On any decode failure (malformed base64), the script exits
#   non-zero so CI flags it loudly.
#
# Encode a local file to its base64 form with:
#   base64 -i ~/Desktop/teka-rdc/buyer/android/google-services.json | pbcopy

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

decode_to() {
  local var_name="$1"
  local dest="$2"
  local value="${!var_name-}"
  if [ -z "$value" ]; then
    echo "skip $var_name (not set)"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  # `base64 -d` is GNU/BSD-portable. The double-quoted heredoc avoids
  # arg-length limits if the value is large.
  printf '%s' "$value" | base64 -d > "$dest"
  echo "wrote $dest ($(wc -c < "$dest") bytes)"
}

decode_to BUYER_GOOGLE_SERVICES_JSON_B64 \
  "$repo_root/apps/buyer-mobile/android/app/google-services.json"
decode_to SELLER_GOOGLE_SERVICES_JSON_B64 \
  "$repo_root/apps/seller-mobile/android/app/google-services.json"

# iOS placements are commented out until PR C lands the ios/ folders.
# decode_to BUYER_GOOGLE_SERVICE_INFO_PLIST_B64 \
#   "$repo_root/apps/buyer-mobile/ios/Runner/GoogleService-Info.plist"
# decode_to SELLER_GOOGLE_SERVICE_INFO_PLIST_B64 \
#   "$repo_root/apps/seller-mobile/ios/Runner/GoogleService-Info.plist"
# decode_to APNS_AUTH_KEY_P8_B64 \
#   "$repo_root/secrets/AuthKey.p8"
