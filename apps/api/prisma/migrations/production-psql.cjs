// Production psql runner (runs INSIDE the api container; Node stdlib only).
//
// Replaces the old `eval "$(node -e ...)"` DATABASE_URL → PG* export dance.
// It validates DATABASE_URL against the one approved production target and
// strict TLS settings, checks the pinned public DB CA, then spawns psql with
// the connection passed ONLY via libpq env vars (never argv, never printed).
// Ambient PG* routing vars (PGHOSTADDR, PGSERVICE, PGOPTIONS, ...) are dropped
// so nothing can divert the connection or downgrade TLS.
//
// psql stderr is discarded: errors can echo SQL and customer rows into CI logs.
// stdout is discarded too except for an explicit -c query (or captured ledger
// output). Failures report a fixed message plus psql's exit status.
//
// Usage (cwd = /app/apps/api):
//   node prisma/migrations/production-psql.cjs [psql args...]   (stdin = SQL)
//   node prisma/migrations/production-psql.cjs --migration <file.sql>
//       runs prisma/migrations/manual/<file.sql> with ON_ERROR_STOP, then
//       records it in _manual_migrations (same ledger as apply-auto.sh).
// From the host (current image may predate this file), pass the code itself:
//   node -e "<contents of this file>" -- [args...]
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const TARGET = { host: '10.77.0.3', port: '5433', db: 'teka_prod', user: 'congofoot_user_teka_rdc' };
const CA_PATH = '/run/teka-db-ca/ca.crt';
const CA_SHA256 = 'bb4912352c678e70053270b340b0445395b52d42221961dfd819381abba47c64';
const PRISMA_PARAMS = { sslmode: 'require', sslaccept: 'strict', sslcert: CA_PATH };
const MANUAL_DIR = 'prisma/migrations/manual';
const LEDGER_DDL =
  'CREATE TABLE IF NOT EXISTS _manual_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());';

class Fail extends Error {}

// Validated libpq env for the child. Throws Fail(code) — never the raw URL.
function connectionEnv(env, ca = { path: CA_PATH, sha256: CA_SHA256 }) {
  let u;
  try {
    u = new URL(env.DATABASE_URL || '');
  } catch {
    throw new Fail('DB_URL_INVALID');
  }
  let user;
  let password;
  try {
    user = decodeURIComponent(u.username);
    password = decodeURIComponent(u.password);
  } catch {
    throw new Fail('DB_URL_INVALID');
  }
  if (u.protocol !== 'postgresql:' || u.hostname !== TARGET.host || u.port !== TARGET.port ||
      u.pathname !== '/' + TARGET.db || user !== TARGET.user || !password || u.hash) {
    throw new Fail('DB_TARGET_MISMATCH');
  }
  const params = [...u.searchParams];
  const keys = Object.keys(PRISMA_PARAMS);
  if (params.length !== keys.length || !params.every(([k, v]) => PRISMA_PARAMS[k] === v) ||
      new Set(params.map(([k]) => k)).size !== keys.length) {
    throw new Fail('DB_TLS_PARAMS');
  }
  if (env.PGSSLMODE !== 'verify-full' || env.PGSSLROOTCERT !== CA_PATH) throw new Fail('PG_TLS_ENV');
  let digest;
  try {
    digest = crypto.createHash('sha256').update(fs.readFileSync(ca.path)).digest('hex');
  } catch {
    throw new Fail('CA_MISSING');
  }
  if (digest !== ca.sha256) throw new Fail('CA_PIN');

  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith('PG') && k !== 'DATABASE_URL' && k !== 'PSQLRC') out[k] = v;
  }
  return Object.assign(out, {
    PGHOST: TARGET.host, PGPORT: TARGET.port, PGDATABASE: TARGET.db, PGUSER: user,
    PGPASSWORD: password, PGSSLMODE: 'verify-full', PGSSLROOTCERT: ca.path,
  });
}

// Strict allowlist (libpq accepts abbreviated long options such as --hos, so
// no long option is accepted at all): flag clusters of t/A/q/X, optionally
// ending in c <SQL> or f <file> (value attached or next), and only the exact
// `-v ON_ERROR_STOP=1`. Returns true for a -c query (stdout is its result).
function checkPsqlArgs(args) {
  let query = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-v' && args[i + 1] === 'ON_ERROR_STOP=1') {
      i++;
      continue;
    }
    if (a === '-vON_ERROR_STOP=1') continue;
    const m = /^-([tAqX]*)([cf]?)([\s\S]*)$/.exec(a);
    if (!m || a.length < 2 || (!m[2] && m[3])) throw new Fail('PSQL_ARG');
    if (m[2] && !m[3]) {
      if (i + 1 >= args.length) throw new Fail('PSQL_ARG');
      i++;
    }
    if (m[2] === 'c') query = true;
  }
  return query;
}

// stdout: 'pipe' (captured), 'inherit' (-c query result) or 'ignore' (SQL
// files / stdin: RETURNING or SELECT rows must not reach CI logs).
function psql(env, args, opts, stdout = 'ignore') {
  const capture = stdout === 'pipe';
  // Our ON_ERROR_STOP comes last so it always wins.
  const r = spawnSync(opts.psql || 'psql', ['-X', ...args, '-v', 'ON_ERROR_STOP=1'], {
    env,
    stdio: ['inherit', stdout, 'ignore'],
    encoding: 'utf8',
  });
  if (r.error) throw new Fail('PSQL_SPAWN');
  if (r.status !== 0) {
    console.error(`production-psql: psql failed (exit ${r.status ?? 'signal'}); details suppressed`);
    const e = new Fail('PSQL_EXIT');
    e.status = r.status || 1;
    throw e;
  }
  return capture ? r.stdout.trim() : '';
}

// Returns the process exit code. opts = { ca, psql } exist for the regression
// test only; production always uses the fixed CA path/pin and `psql` on PATH.
function run(args, env = process.env, opts = {}) {
  try {
    let migration = null;
    let query = false;
    if (args[0] === '--migration') {
      if (args.length !== 2 || !/^[A-Za-z0-9._-]+\.sql$/.test(args[1]) || args[1].startsWith('-')) {
        throw new Fail('MIGRATION_NAME');
      }
      migration = args[1];
    } else {
      query = checkPsqlArgs(args);
    }
    const childEnv = connectionEnv(env, opts.ca);
    if (!migration) {
      psql(childEnv, args, opts, query ? 'inherit' : 'ignore');
      return 0;
    }
    const file = `${MANUAL_DIR}/${migration}`;
    if (!fs.existsSync(file)) throw new Fail('MIGRATION_NOT_FOUND');
    console.log(`▶ applying ${file}`);
    // ON_ERROR_STOP is load-bearing: without it psql exits 0 on SQL errors and
    // the file would be recorded as applied.
    psql(childEnv, ['-v', 'ON_ERROR_STOP=1', '-q', '-f', file], opts);
    // Record only AFTER success. DO NOTHING keeps the first applied_at; manual
    // runs always re-run the file (no pre-check) — see apply-migration.yml.
    psql(childEnv, ['-v', 'ON_ERROR_STOP=1', '-q', '-c', LEDGER_DDL], opts);
    const recorded = psql(childEnv, ['-v', 'ON_ERROR_STOP=1', '-tAq', '-c',
      `INSERT INTO _manual_migrations (filename) VALUES ('${migration}') ON CONFLICT (filename) DO NOTHING RETURNING 1;`],
    opts, 'pipe');
    console.log(recorded === '1'
      ? `  ✓ recorded in _manual_migrations: ${migration}`
      : `  ✓ already recorded in _manual_migrations (re-run): ${migration}`);
    return 0;
  } catch (e) {
    if (!(e instanceof Fail)) {
      console.error('production-psql: FAIL INTERNAL');
      return 2;
    }
    if (e.message !== 'PSQL_EXIT') console.error(`production-psql: FAIL ${e.message}`);
    return e.status || 2;
  }
}

module.exports = { run, connectionEnv, checkPsqlArgs, LEDGER_DDL };

// Direct file run, or `node -e "<this code>" -- args` (module id '[eval]',
// where argv has no script path).
if (require.main === module || module.id === '[eval]') {
  process.exitCode = run(process.argv.slice(module.id === '[eval]' ? 1 : 2));
}
