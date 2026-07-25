#!/bin/sh
# Auto-apply manual migrations during deploy (EXPAND phase).
#
# Runs INSIDE the api container (deploy.yml invokes it via a one-off
# `docker compose run --rm --no-deps api sh prisma/migrations/apply-auto.sh`
# from the freshly-pulled new image, BEFORE the rolling swap). node, psql and
# DATABASE_URL (from env_file: .env.production) are all present here.
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

# Parse DATABASE_URL with Node (JS URL decodes an @ in the password correctly;
# libpq does not) and export the unambiguous PG* vars psql reads. Same proven
# approach as apply-migration.yml — here in a standalone script the node body
# is single-quoted so its JSON.stringify double-quotes need no escaping.
eval "$(node -e '
  const u = new URL(process.env.DATABASE_URL);
  console.log("export PGHOST=" + JSON.stringify(u.hostname));
  console.log("export PGPORT=" + JSON.stringify(u.port || "5432"));
  console.log("export PGUSER=" + JSON.stringify(decodeURIComponent(u.username)));
  console.log("export PGPASSWORD=" + JSON.stringify(decodeURIComponent(u.password)));
  console.log("export PGDATABASE=" + JSON.stringify(u.pathname.slice(1).replace(/\?.*/, "")));
')"

# Audit + once-only bookkeeping table.
psql -v ON_ERROR_STOP=1 -q -c \
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
  already=$(psql -tAqc "SELECT 1 FROM _manual_migrations WHERE filename = '$file'")
  if [ "$already" = "1" ]; then
    echo "  ✓ already applied, skipping: $file"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  echo "  ▶ applying: $file"
  psql -v ON_ERROR_STOP=1 -q -f "$path"
  # Record only after the file succeeded. Non-atomic with the file on purpose:
  # if this INSERT somehow fails, the idempotent file simply re-runs next deploy.
  psql -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO _manual_migrations (filename) VALUES ('$file') ON CONFLICT (filename) DO NOTHING;"
  echo "  ✓ applied: $file"
  applied_count=$((applied_count + 1))
done < "$MANIFEST"

echo "Auto-apply migrations done: $applied_count applied, $skipped_count skipped."
