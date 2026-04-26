#!/usr/bin/env bash
# Run an arbitrary SQL file against the prod DB.
#
# The DATABASE_URL in .env.production has a literal `@` in the password,
# which Prisma accepts but libpq (psql/pg_dump) rejects unless the password
# is URL-encoded. This wrapper reads .env.production, percent-encodes the
# password, and pipes the SQL into a one-shot postgres:16-alpine container.
#
# Usage (run from /home/deploy/teka-rdc on the VPS):
#   bash scripts/run-prod-sql.sh /path/to/file.sql
#
# Reads .env.production from the current working directory.

set -euo pipefail

SQL_FILE="${1:-}"
if [[ -z "$SQL_FILE" || ! -f "$SQL_FILE" ]]; then
  echo "Usage: $0 <sql-file>" >&2
  exit 1
fi

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production not found in $(pwd)" >&2
  exit 1
fi

DB_ENC=$(python3 - <<'PY'
import re, urllib.parse
t = open('.env.production').read()
m = re.search(r'^DATABASE_URL=(.+)$', t, re.M)
if not m:
    raise SystemExit("DATABASE_URL not found in .env.production")
u = m.group(1).strip().strip('"').strip("'")
i = u.find('://') + 3
rest = u[i:]
at = rest.rfind('@')
userinfo, host = rest[:at], rest[at+1:]
colon = userinfo.find(':')
user, pwd = userinfo[:colon], userinfo[colon+1:]
print(u[:i] + user + ':' + urllib.parse.quote(pwd, safe='') + '@' + host, end='')
PY
)

exec docker run --rm -i \
  -e DATABASE_URL="$DB_ENC" \
  postgres:16-alpine \
  sh -c 'psql "$DATABASE_URL"' \
  < "$SQL_FILE"
