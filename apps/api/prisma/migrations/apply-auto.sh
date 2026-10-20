#!/bin/sh
# Auto-apply manual migrations during deploy (EXPAND phase).
#
# Runs INSIDE the api container (deploy.yml invokes it via a one-off
# `docker compose run --rm --no-deps api sh prisma/migrations/apply-auto.sh`
# from the freshly-pulled new image, BEFORE the rolling swap). node, psql,
# DATABASE_URL and the PG TLS env/CA (host canonical api runtime, see
# docker-compose.db-tls.yml) are all present here.
#
# For each file listed in prisma/migrations/manual/auto-apply.list it:
#   - skips the file if already recorded in the `_manual_migrations` table,
#   - otherwise runs it (ON_ERROR_STOP → any SQL error aborts the deploy
#     before the swap, so the old containers keep serving), then records it.
# Every listed migration is idempotent as well (defence in depth), so a
# re-run — or a fresh table on a DB where a migration was already applied by
# hand — is safe.
#
# Exit non-zero on the first failure so the deploy step (set -e) stops before
# swapping in the new code.
set -eu

MANUAL_DIR="prisma/migrations/manual"
MANIFEST="$MANUAL_DIR/auto-apply.list"

if [ ! -f "$MANIFEST" ]; then
  echo "No auto-apply manifest at $MANIFEST — nothing to do."
  exit 0
fi

# Every psql call goes through the shared runner: it validates DATABASE_URL
# (approved target + strict TLS + pinned CA) and hands psql only libpq env
# vars — no eval, no credentials in argv, psql errors suppressed.
PSQL="node prisma/migrations/production-psql.cjs"

# Audit + once-only bookkeeping table.
$PSQL -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS _manual_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"

applied_count=0
skipped_count=0

# Read the manifest line by line. Ignore blank lines and # comments.
while IFS= read -r raw || [ -n "$raw" ]; do
  file=$(printf '%s' "$raw" | sed 's/#.*//; s/^[[:space:]]*//; s/[[:space:]]*$//')
  [ -z "$file" ] && continue

  path="$MANUAL_DIR/$file"
  if [ ! -f "$path" ]; then
    echo "::error:: auto-apply migration listed but not found in image: $path"
    exit 1
  fi

  # Skip if already applied (recorded). psql -tAqc → bare "1" or empty.
  already=$($PSQL -tAqc"SELECT 1 FROM _manual_migrations WHERE filename = '$file'")
  if [ "$already" = "1" ]; then
    echo "  ✓ already applied, skipping: $file"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  echo "  ▶ applying: $file"
  $PSQL -v ON_ERROR_STOP=1 -q -f "$path"
  # Record only after the file succeeded. Non-atomic with the file on purpose:
  # if this INSERT somehow fails, the idempotent file simply re-runs next deploy.
  $PSQL -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO _manual_migrations (filename) VALUES ('$file') ON CONFLICT (filename) DO NOTHING;"
  echo "  ✓ applied: $file"
  applied_count=$((applied_count + 1))
done < "$MANIFEST"

echo "Auto-apply migrations done: $applied_count applied, $skipped_count skipped."
