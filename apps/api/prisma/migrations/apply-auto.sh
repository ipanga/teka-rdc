#!/bin/sh
# Auto-apply manifest ledger check (default) / explicit apply.
#
# Runs INSIDE the api container. node, psql, DATABASE_URL and the PG TLS
# env/CA (host canonical api runtime, see docker-compose.db-tls.yml) are all
# present here.
#
#   sh prisma/migrations/apply-auto.sh [--check-only]   (DEFAULT, deploy)
#     READ-ONLY: every entry in prisma/migrations/manual/auto-apply.list must
#     exist in the image (exactly EXPECTED_ENTRIES of them) and already be
#     recorded in `_manual_migrations`. A duplicate entry fails before any SQL.
#     The single ledger query runs inside a server-side READ ONLY transaction;
#     nothing is created, inserted or executed. A missing manifest/ledger, an
#     unapplied filename or any SQL error exits non-zero, so deploy stops
#     BEFORE the rolling swap.
#
#   sh prisma/migrations/apply-auto.sh --apply
#     Separately authorised manual use ONLY (never wired to deploy): for each
#     listed file not yet recorded, run it (ON_ERROR_STOP) and record it. Every
#     listed migration is idempotent as well (defence in depth).
set -eu

usage() {
  echo "usage: sh prisma/migrations/apply-auto.sh [--check-only | --apply]" >&2
  exit 2
}
[ "$#" -le 1 ] || usage
case "${1:-}" in
  '' | --check-only) MODE=check ;;
  --apply) MODE=apply ;;
  *) usage ;;
esac

MANUAL_DIR="prisma/migrations/manual"
MANIFEST="$MANUAL_DIR/auto-apply.list"
# Known production manifest size. Adding an entry means it must be applied
# explicitly first, then this number is bumped in the same reviewed change.
EXPECTED_ENTRIES=16

if [ ! -f "$MANIFEST" ]; then
  if [ "$MODE" = check ]; then
    echo "::error:: auto-apply manifest missing in image: $MANIFEST"
    exit 1
  fi
  echo "No auto-apply manifest at $MANIFEST — nothing to do."
  exit 0
fi

# Every psql call goes through the shared runner: it validates DATABASE_URL
# (approved target + strict TLS + pinned CA) and hands psql only libpq env
# vars — no eval, no credentials in argv, psql errors suppressed.
PSQL="node prisma/migrations/production-psql.cjs"

# Validate the manifest first (both modes): safe file names, present in image.
entries=""
count=0
while IFS= read -r raw || [ -n "$raw" ]; do
  file=$(printf '%s' "$raw" | sed 's/#.*//; s/^[[:space:]]*//; s/[[:space:]]*$//')
  [ -z "$file" ] && continue
  case "$file" in
    -* | *..* | *[!A-Za-z0-9._-]*) echo "::error:: invalid auto-apply manifest entry"; exit 1 ;;
    *.sql) ;;
    *) echo "::error:: invalid auto-apply manifest entry"; exit 1 ;;
  esac
  path="$MANUAL_DIR/$file"
  if [ ! -f "$path" ]; then
    echo "::error:: auto-apply migration listed but not found in image: $path"
    exit 1
  fi
  case " $entries " in
    *" $file "*) echo "::error:: duplicate auto-apply manifest entry: $file"; exit 1 ;;
  esac
  entries="$entries $file"
  count=$((count + 1))
done < "$MANIFEST"

if [ "$MODE" = check ]; then
  if [ "$count" -eq 0 ]; then
    echo "::error:: auto-apply manifest is empty"
    exit 1
  fi
  if [ "$count" -ne "$EXPECTED_ENTRIES" ]; then
    echo "::error:: auto-apply manifest has $count entries, expected $EXPECTED_ENTRIES"
    exit 1
  fi
  # One read-only transaction, rolled back. A missing ledger table is a SQL
  # error under ON_ERROR_STOP → non-zero → fail closed (details suppressed).
  applied=$($PSQL -v ON_ERROR_STOP=1 -tAq -c "BEGIN READ ONLY; SELECT filename FROM public._manual_migrations; ROLLBACK;") || {
    echo "::error:: read-only ledger check failed (ledger missing or psql error; details suppressed)"; exit 1; }
  missing=0
  for file in $entries; do
    if ! printf '%s\n' "$applied" | grep -Fxq -- "$file"; then
      echo "::error:: auto-apply migration NOT applied in production: $file"
      missing=$((missing + 1))
    fi
  done
  if [ "$missing" -ne 0 ]; then
    echo "::error:: $missing unapplied migration(s) — stop before rollout; apply only with separate authorisation"
    exit 1
  fi
  echo "Auto-apply ledger check OK (read-only): 0 applied, $count verified."
  exit 0
fi

# --apply (explicit, separately authorised). Audit + once-only bookkeeping table.
$PSQL -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS _manual_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"

applied_count=0
skipped_count=0

for file in $entries; do
  path="$MANUAL_DIR/$file"

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
  # if this INSERT somehow fails, the idempotent file simply re-runs next time.
  $PSQL -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO _manual_migrations (filename) VALUES ('$file') ON CONFLICT (filename) DO NOTHING;"
  echo "  ✓ applied: $file"
  applied_count=$((applied_count + 1))
done

echo "Auto-apply migrations done: $applied_count applied, $skipped_count skipped."
