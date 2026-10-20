#!/usr/bin/env bash
# Run SQL against the prod DB through the running api container.
#
# Goes through scripts/production-compose.py (validated runtime/CA/target) and
# the shared runner apps/api/prisma/migrations/production-psql.cjs, passed as
# `node -e <public code>` so it also works on api images that predate the file.
# The runner reads DATABASE_URL inside the container, verifies the approved
# target + strict TLS + CA pin and gives psql only libpq env vars: no
# credentials in argv, no eval, no extra container. psql errors are suppressed
# (they can echo customer rows); the exit status is preserved.
#
# Usage (on the app host; files synced by the deploy workflow):
#   bash scripts/run-prod-sql.sh /path/to/file.sql     # SQL via stdin, ON_ERROR_STOP
#   bash scripts/run-prod-sql.sh --migration <file.sql>
#       applies prisma/migrations/manual/<file.sql> bundled in the running api
#       image and records it in _manual_migrations (apply-migration ledger).

set -euo pipefail

if [[ "${1:-}" == "--migration" && $# -eq 2 ]]; then
  ARGS=(--migration "$2")
  exec </dev/null
elif [[ $# -eq 1 && -f "$1" ]]; then
  ARGS=(-v ON_ERROR_STOP=1)
  exec <"$1"   # open before cd so relative paths keep working
else
  echo "Usage: $0 <sql-file> | --migration <file.sql>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
RUNNER="apps/api/prisma/migrations/production-psql.cjs"
[[ -f "$RUNNER" ]] || { echo "ERROR: $RUNNER not found" >&2; exit 1; }
CODE="$(cat "$RUNNER")"

exec python3 scripts/production-compose.py exec -T api node -e "$CODE" -- "${ARGS[@]}"
