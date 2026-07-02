#!/usr/bin/env bash
#
# Xcode build-phase script (Runner target) — selects the flavor's
# GoogleService-Info.plist and drops it into the built .app.
#
# Mirrors Android, where one merged google-services.json covers all three
# flavors. On iOS the plist is per-bundle-id, so we pick per flavor:
#   ios/Runner/config/<flavor>/GoogleService-Info.plist   (preferred)
#   ios/Runner/GoogleService-Info.plist                   (fallback — currently prod)
#
# GRACEFUL FALLBACK: until dev/staging iOS apps are registered in Firebase and
# their plists provided, dev/staging builds fall back to the production plist so
# nothing breaks. Drop the real per-flavor plists at the config/<flavor>/ paths
# (gitignored; wire into scripts/sync-firebase-secrets.sh) to upgrade — no code
# change needed. Fails only if NEITHER a flavor plist nor the fallback exists.
#
# Flavor is derived from $CONFIGURATION (e.g. "Release-production" -> production).

set -euo pipefail

# CONFIGURATION looks like "Debug-development" / "Release-production" / etc.
flavor="${CONFIGURATION##*-}"
case "$flavor" in
  development|staging|production) ;;
  *) echo "warning: unrecognized flavor from CONFIGURATION='${CONFIGURATION:-}' — using fallback plist"; flavor="" ;;
esac

flavor_plist="${SRCROOT}/Runner/config/${flavor}/GoogleService-Info.plist"
fallback_plist="${SRCROOT}/Runner/GoogleService-Info.plist"

if [ -n "$flavor" ] && [ -f "$flavor_plist" ]; then
  src="$flavor_plist"
  echo "Firebase: using ${flavor} plist"
elif [ -f "$fallback_plist" ]; then
  src="$fallback_plist"
  echo "Firebase: ${flavor:-unknown} plist not found — falling back to Runner/GoogleService-Info.plist"
else
  echo "error: no GoogleService-Info.plist found (looked for $flavor_plist and $fallback_plist)" >&2
  exit 1
fi

dest="${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
mkdir -p "$(dirname "$dest")"
cp -f "$src" "$dest"
echo "Firebase: copied -> $dest"
