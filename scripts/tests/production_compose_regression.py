#!/usr/bin/env python3
"""Focused regression for the Post-P2 production DB wiring (stdlib only).

Needs the local `docker` CLI (only `docker compose config`, no daemon calls,
no containers) and `node`. No real database, no SQL is executed.

  python3 -B scripts/tests/production_compose_regression.py   (also CI Release Config)

1. Real `docker compose config` on the repo compose files, pointed at a
   synthetic runtime (dollars, quotes, multiline) + a stale .env.production DB
   URL: helper validation passes, so the api env is exactly the runtime and the
   CA is mounted read-only. Missing runtime / wrong target / TLS downgrade /
   wrong CA / bad TEKA_API_IMAGE all fail closed.
2. production-psql.cjs with a stub psql: child gets only libpq env vars (special
   password intact, ambient PGHOSTADDR/PGSERVICE dropped, no DATABASE_URL), no
   credentials in argv; bad TLS params and routing args never spawn psql.
"""
import hashlib
import importlib.util
import json
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Public, hard-coded test fixture (not a credential): exercises URL/libpq escaping
# of special characters in the userinfo field of a synthetic DB URL.
SYNTHETIC_FIXTURE_USERINFO = 'p@ss:w/rd$x"\'%'
DB_URL = ('postgresql://congofoot_user_teka_rdc:' + SYNTHETIC_FIXTURE_USERINFO.replace('%', '%25').replace('@', '%40')
          .replace(':', '%3A').replace('/', '%2F').replace('"', '%22').replace("'", '%27')
          + '@10.77.0.3:5433/teka_prod?sslmode=require&sslaccept=strict&sslcert=%2Frun%2Fteka-db-ca%2Fca.crt')
CA_BYTES = b'-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----\n'
failures = []


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok:
        failures.append(name)


def load_helper():
    spec = importlib.util.spec_from_file_location('pc', os.path.join(ROOT, 'scripts/production-compose.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def expect_fail(pc, name, code_prefix, env=None):
    saved = dict(os.environ)
    os.environ.update(env or {})
    try:
        pc.validate()
        check(name, False)
    except pc.Fail as e:
        check(f'{name} ({e})', str(e).startswith(code_prefix))
    finally:
        os.environ.clear()
        os.environ.update(saved)


def compose_tests(tmp):
    pc = load_helper()
    proj, conf = os.path.join(tmp, 'proj'), os.path.join(tmp, 'conf')
    os.makedirs(proj)
    os.mkdir(conf, 0o700)
    os.chmod(conf, 0o700)
    with open(os.path.join(ROOT, 'docker-compose.prod.yml')) as f:
        open(os.path.join(proj, 'docker-compose.prod.yml'), 'w').write(f.read())
    with open(os.path.join(ROOT, 'docker-compose.db-tls.yml')) as f:
        open(os.path.join(proj, 'docker-compose.db-tls.yml'), 'w').write(
            f.read().replace('/home/deploy/.config/teka-rdc', conf))
    open(os.path.join(proj, '.env.production'), 'w').write(
        'DATABASE_URL=postgresql://old:old@stale.example:5432/old\nJWT_SECRET=stale\n')
    ca = os.path.join(conf, 'production-ca.crt')
    open(ca, 'wb').write(CA_BYTES)
    os.chmod(ca, 0o444)
    runtime = os.path.join(conf, 'api-runtime.json')
    env = {'DATABASE_URL': DB_URL, 'PGSSLMODE': 'verify-full', 'PGSSLROOTCERT': '/run/teka-db-ca/ca.crt',
           'JWT_SECRET': 'a$b$$c"d\'e', 'MULTI': 'line1\nline2 "q" $HOME'}

    def write_runtime(e):
        if os.path.exists(runtime):
            os.chmod(runtime, 0o600)
        escaped = {k: v.replace('$', '$$') for k, v in e.items()}
        # Create 0600 before any bytes are written (mode applies only on creation;
        # an existing file was restored to 0600 above).
        fd = os.open(runtime, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(json.dumps({'services': {'api': {'environment': escaped}}}))

    pc.TRUST_ROOT, pc.PROJECT_DIR, pc.CONF_DIR, pc.RUNTIME, pc.CA = tmp, proj, conf, runtime, ca
    pc.CA_SHA256 = hashlib.sha256(CA_BYTES).hexdigest()
    for k in [k for k in os.environ if k.startswith('TEKA_')]:
        del os.environ[k]

    write_runtime(env)
    try:
        pc.validate()
        check('effective api env == runtime (stale env DB ignored), CA mount ro', True)
    except pc.Fail as e:
        check(f'effective api env == runtime ({e})', False)

    # Deploy pins all four services to build digests; each must render as-is.
    pinned = {var: f'ghcr.io/ipanga/teka-rdc/{svc}@sha256:' + str(i + 1) * 64
              for i, (svc, var) in enumerate(pc.IMAGE_VARS.items())}
    saved = dict(os.environ)
    os.environ.update(pinned)
    try:
        pc.validate()
        check('all four digest pins render into effective config', True)
    except pc.Fail as e:
        check(f'all four digest pins render into effective config ({e})', False)
    finally:
        os.environ.clear()
        os.environ.update(saved)
    expect_fail(pc, 'tag-only TEKA_BUYER_WEB_IMAGE rejected', 'WEB_IMAGE',
                {'TEKA_BUYER_WEB_IMAGE': 'ghcr.io/ipanga/teka-rdc/buyer-web:latest'})
    expect_fail(pc, 'cross-service web digest rejected', 'WEB_IMAGE',
                {'TEKA_ADMIN_WEB_IMAGE': 'ghcr.io/ipanga/teka-rdc/seller-web@sha256:' + '1' * 64})

    # Unsafe parents of the protected runtime: group-writable, symlinked.
    os.chmod(tmp, 0o770)
    expect_fail(pc, 'group-writable runtime parent rejected', 'RUNTIME_DIR_PARENT')
    os.chmod(tmp, 0o700)
    link = os.path.join(tmp, 'link')
    os.symlink(tmp, link)
    pc.CONF_DIR, pc.RUNTIME, pc.CA = (p.replace(tmp, link, 1) for p in (conf, runtime, ca))
    expect_fail(pc, 'symlinked runtime parent rejected', 'RUNTIME_DIR_PARENT')
    pc.CONF_DIR, pc.RUNTIME, pc.CA = conf, runtime, ca

    # Live api (docker inspect stubbed): wrong live env / CA must refuse even
    # though the rendered config above is correct.
    def live_case(name, code, env_over=None, extra=(), mount=None, labels=None):
        cenv = {**env, **(env_over or {})}
        info = {'Image': 'sha256:img', 'State': {'Running': True},
                'Config': {'Labels': labels or {'com.docker.compose.project': 'teka-rdc',
                                                'com.docker.compose.service': 'api'},
                           'Env': [f'{k}={v}' for k, v in cenv.items()] + ['PATH=/usr/bin', *extra]},
                'Mounts': [{'Destination': '/run/teka-db-ca/ca.crt', 'Type': 'bind', 'RW': False,
                            'Source': ca, **(mount or {})}]}
        replies = {'ps': 'cid1\n', 'inspect': json.dumps([info]),
                   'image': json.dumps([{'Config': {'Env': ['PATH=/usr/bin']}}])}
        saved = pc.docker_capture
        pc.docker_capture = lambda args, _env, _code: replies[args[0]]
        try:
            pc.check_live(env, {})
            check(name, code is None)
        except pc.Fail as e:
            check(f'{name} ({e})', code is not None and str(e) == code)
        finally:
            pc.docker_capture = saved

    live_case('live api canonical env + ro pinned CA accepted', None)
    live_case('live api wrong DB URL rejected', 'LIVE_ENV_DRIFT',
              {'DATABASE_URL': DB_URL.replace('10.77.0.3', '10.77.0.4')})
    live_case('live api unexplained extra env rejected', 'LIVE_ENV_DRIFT', extra=['PGHOSTADDR=6.6.6.6'])
    live_case('live api CA from unexpected source rejected', 'LIVE_CA_MOUNT', mount={'Source': runtime})
    live_case('live api writable CA mount rejected', 'LIVE_CA_MOUNT', mount={'RW': True})
    live_case('live api foreign project label rejected', 'LIVE_API_LABELS',
              labels={'com.docker.compose.project': 'other', 'com.docker.compose.service': 'api'})

    expect_fail(pc, 'unpinned TEKA_API_IMAGE rejected', 'API_IMAGE', {'TEKA_API_IMAGE': 'ghcr.io/ipanga/teka-rdc/api:v1'})
    write_runtime({**env, 'DATABASE_URL': DB_URL.replace('10.77.0.3', '10.77.0.4')})
    expect_fail(pc, 'wrong DB host rejected', 'DB_TARGET_MISMATCH')
    write_runtime({**env, 'DATABASE_URL': DB_URL.replace('sslaccept=strict', 'sslaccept=accept_invalid_certs')})
    expect_fail(pc, 'TLS downgrade rejected', 'DB_TLS_PARAMS')
    write_runtime({**env, 'PGSSLMODE': 'require'})
    expect_fail(pc, 'PGSSLMODE downgrade rejected', 'PG_TLS_ENV')
    write_runtime(env)
    pc.CA_SHA256 = '0' * 64
    expect_fail(pc, 'wrong CA hash rejected', 'CA_PIN')
    pc.CA_SHA256 = hashlib.sha256(CA_BYTES).hexdigest()
    os.chmod(runtime, 0o644)
    expect_fail(pc, 'group/world-readable runtime rejected', 'RUNTIME_MODE')
    os.unlink(runtime)
    expect_fail(pc, 'missing runtime rejected', 'RUNTIME_MISSING')
    # Base-only Compose (no helper) must also refuse without the runtime file.
    r = subprocess.run(['docker', 'compose', '--env-file', '.env.production', '-f', 'docker-compose.prod.yml',
                        'config', '-q'], cwd=proj, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    check('plain compose config fails without runtime (no stale fallback)', r.returncode != 0)

    # Persistent Compose overrides after the subcommand: rejected before validate/exec.
    saved_validate, saved_exec = pc.validate, pc.os.execvpe

    def must_not_run(*_a):
        raise AssertionError('reached validate/exec')
    pc.validate = pc.os.execvpe = must_not_run
    codes = []
    try:
        for argv in (['up', '--file', 'evil.yml'], ['up', '--file=evil.yml'], ['pull', '-fevil.yml'],
                     ['ps', '--env-file=x'], ['up', '--project-name', 'other'], ['up', '--project-name=other'],
                     ['up', '-pother'], ['up', '--project-directory', '/tmp'], ['up', '--profile=x'],
                     ['logs', '-f', 'api']):
            try:
                pc.main(argv)
                codes.append(None)
            except pc.Fail as e:
                codes.append(str(e))
            except AssertionError:
                codes.append('REACHED')
        pc.validate = lambda: (_ for _ in ()).throw(pc.Fail('SENTINEL'))
        try:
            pc.main(['exec', '-T', 'api', 'node', '-e', 'require("x")'])
        except pc.Fail as e:
            codes.append(str(e))
    finally:
        pc.validate, pc.os.execvpe = saved_validate, saved_exec
    check('misplaced file/env/project/profile overrides rejected before validate/exec',
          codes[:-1] == ['GLOBAL_OPTION'] * 10 and codes[-1] == 'SENTINEL')


NODE_TEST = r"""
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [runner, tmp, url] = process.argv.slice(1);
const m = require(runner);
const ca = path.join(tmp, 'ca.crt'); fs.writeFileSync(ca, 'synthetic-ca');
const out = path.join(tmp, 'psql.out'), stub = path.join(tmp, 'psql');
fs.writeFileSync(stub, `#!/bin/sh\n{ env; echo ARGS; printf '%s\\n' "$@"; } > '${out}'\necho "ROW-$MARK"\n`, { mode: 0o755 });
const opts = { psql: stub, ca: { path: ca, sha256: crypto.createHash('sha256').update('synthetic-ca').digest('hex') } };
const env = { PATH: process.env.PATH, DATABASE_URL: url, PGSSLMODE: 'verify-full', MARK: 'query',
  PGSSLROOTCERT: '/run/teka-db-ca/ca.crt', PGHOSTADDR: '6.6.6.6', PGSERVICE: 'evil', PGOPTIONS: '-c x=y' };
const res = {};
res.ok = m.run(['-c', 'SELECT 1'], env, opts);
res.out = fs.readFileSync(out, 'utf8'); fs.unlinkSync(out);
res.stdinSql = m.run(['-v', 'ON_ERROR_STOP=1'], { ...env, MARK: 'stdin' }, opts); fs.unlinkSync(out);
res.downgrade = m.run(['-c', 'SELECT 1'], { ...env, DATABASE_URL: url.replace('sslaccept=strict', 'sslaccept=accept_invalid_certs') }, opts);
res.routing = m.run(['-h', 'evil', '-c', 'SELECT 1'], env, opts);
res.abbrev = [['--hos', 'evil'], ['--dbn=x'], ['--set', 'x=y']].map((a) => m.run([...a, '-c', 'SELECT 1'], env, opts));
res.stopOverride = [['-v', 'ON_ERROR_STOP=0'], ['-vON_ERROR_STOP=0'], ['-qv', 'ON_ERROR_STOP=0']]
  .map((a) => m.run([...a, '-c', 'SELECT 1'], env, opts));
res.badName = m.run(['--migration', '../x.sql'], env, opts);
res.spawnedAfterRejects = fs.existsSync(out);
console.log(JSON.stringify(res));
"""


def node_tests(tmp):
    runner = os.path.join(ROOT, 'apps/api/prisma/migrations/production-psql.cjs')
    r = subprocess.run(['node', '-e', NODE_TEST, '--', runner, tmp, DB_URL], capture_output=True, text=True,
                       stdin=subprocess.DEVNULL)
    try:
        res = json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        check('node runner harness', False)
        return
    env_part, _, args_part = res['out'].partition('ARGS\n')
    child = dict(line.split('=', 1) for line in env_part.splitlines() if '=' in line)
    check('psql exit 0 propagated', res['ok'] == 0)
    check('special password preserved via PGPASSWORD', child.get('PGPASSWORD') == SYNTHETIC_FIXTURE_USERINFO)
    check('libpq target + verify-full set', child.get('PGHOST') == '10.77.0.3' and child.get('PGPORT') == '5433'
          and child.get('PGDATABASE') == 'teka_prod' and child.get('PGUSER') == 'congofoot_user_teka_rdc'
          and child.get('PGSSLMODE') == 'verify-full')
    check('ambient PGHOSTADDR/PGSERVICE/PGOPTIONS + DATABASE_URL dropped',
          not {'PGHOSTADDR', 'PGSERVICE', 'PGOPTIONS', 'DATABASE_URL'} & set(child))
    check('no credentials in psql argv', SYNTHETIC_FIXTURE_USERINFO not in args_part and 'postgresql://' not in args_part
          and args_part.splitlines()[0] == '-X')
    check('TLS downgrade / routing arg / bad migration name rejected without spawn',
          res['downgrade'] == 2 and res['routing'] == 2 and res['badName'] == 2 and not res['spawnedAfterRejects'])
    check('abbreviated/unknown long options (--hos, --dbn=, --set) rejected', res['abbrev'] == [2, 2, 2])
    check('user ON_ERROR_STOP override rejected', res['stopOverride'] == [2, 2, 2])
    check('runner ON_ERROR_STOP=1 is the last psql arg', args_part.splitlines()[-2:] == ['-v', 'ON_ERROR_STOP=1'])
    check('-c query stdout kept, stdin SQL stdout suppressed',
          res['stdinSql'] == 0 and 'ROW-query' in r.stdout and 'ROW-stdin' not in r.stdout)
    check('no secrets on runner stderr', SYNTHETIC_FIXTURE_USERINFO not in r.stderr and 'postgresql://' not in r.stderr)


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as tmp:
        tmp = os.path.realpath(tmp)
        os.chmod(tmp, 0o700)
        node_tests(tmp)
        compose_tests(tmp)
    print('OK' if not failures else f'{len(failures)} FAILED')
    raise SystemExit(1 if failures else 0)
