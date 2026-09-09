#!/usr/bin/env sh
# Release gate for the auto-apply migration manifest (PR 5, 2026-09-06).
#
# Deterministic checks that catch the release hazards we have actually hit or
# nearly hit — no SQL parser, no database:
#   1. every manifest entry names an existing file (deploy would otherwise fail
#      mid-expand, after images were pulled);
#   2. no entry appears twice (the tracker table would skip the second, hiding
#      an authoring mistake);
#   3. no auto-applied file carries a destructive statement — those belong to
#      the manual "Apply prod migration" workflow at the right moment;
#   4. CREATE TABLE / CREATE INDEX in an auto-applied file are IF NOT EXISTS
#      (the manifest promises idempotence; re-deploys re-run the expand phase).
# SQL comments are stripped before matching so prose never trips the gate.
# Run from apps/api:  sh prisma/migrations/check-manifest.sh
set -eu
MANUAL_DIR="${MANUAL_DIR:-prisma/migrations/manual}"
MANIFEST="$MANUAL_DIR/auto-apply.list"
[ -f "$MANIFEST" ] || { echo "::error::manifest not found: $MANIFEST"; exit 1; }

entries=$(sed 's/#.*//; s/^[[:space:]]*//; s/[[:space:]]*$//' "$MANIFEST" | grep -v '^$' || true)
status=0

dups=$(printf '%s\n' "$entries" | sort | uniq -d)
if [ -n "$dups" ]; then
  echo "::error::duplicate auto-apply entries:"; printf '  %s\n' $dups; status=1
fi

for file in $entries; do
  path="$MANUAL_DIR/$file"
  if [ ! -f "$path" ]; then
    echo "::error::auto-apply entry has no file: $path"; status=1; continue
  fi
  # strip -- line comments and /* */ block comments
  sql=$(sed 's/--.*$//' "$path" | tr '\n' ' ' | sed 's#/\*[^*]*\*\+\([^/*][^*]*\*\+\)*/# #g')
  if printf '%s' "$sql" | grep -qiE '\b(DROP[[:space:]]+(TABLE|COLUMN|INDEX|TYPE)|ALTER[[:space:]]+TABLE[^;]*\bDROP\b|TRUNCATE|DELETE[[:space:]]+FROM)\b'; then
    echo "::error::$file is auto-applied but contains a destructive statement (DROP/TRUNCATE/DELETE) — move it to the manual workflow"; status=1
  fi
  if printf '%s' "$sql" | grep -iE 'CREATE[[:space:]]+(UNIQUE[[:space:]]+)?(TABLE|INDEX)[[:space:]]+' | grep -qivE 'CREATE[[:space:]]+(UNIQUE[[:space:]]+)?(TABLE|INDEX)[[:space:]]+(CONCURRENTLY[[:space:]]+)?IF[[:space:]]+NOT[[:space:]]+EXISTS'; then
    # count non-idempotent occurrences precisely
    bad=$(printf '%s' "$sql" | grep -oiE 'CREATE[[:space:]]+(UNIQUE[[:space:]]+)?(TABLE|INDEX)[[:space:]]+(CONCURRENTLY[[:space:]]+)?[A-Za-z_"]+' | grep -viE 'IF[[:space:]]*$|IF[[:space:]]+NOT' || true)
    if [ -n "$bad" ]; then
      echo "::error::$file is auto-applied but has a CREATE without IF NOT EXISTS:"; printf '  %s\n' "$bad"; status=1
    fi
  fi
  adds=$(printf '%s' "$sql" | grep -oiE 'ADD[[:space:]]+COLUMN[[:space:]]+[A-Za-z_"]+' | grep -viE 'ADD[[:space:]]+COLUMN[[:space:]]+IF' || true)
  if [ -n "$adds" ]; then
    echo "::warning::$file: ADD COLUMN without IF NOT EXISTS (re-running the expand phase would fail): $(printf '%s' "$adds" | tr '\n' ',')"
  fi
done

n=$(printf '%s\n' "$entries" | grep -c . || true)
if [ "$status" -eq 0 ]; then echo "auto-apply manifest OK — $n entries, all present, unique, non-destructive, idempotent CREATEs"; fi
exit $status
