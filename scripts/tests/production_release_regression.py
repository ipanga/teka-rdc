#!/usr/bin/env python3
"""Focused regression for scripts/production-release.py, the read-only
apply-auto.sh ledger check and the reviewed docker-rollout behaviour (stdlib
only; no network, no Docker daemon, no database, no GitHub calls).

  TEKA_REVIEWED_ROLLOUT=/path/to/docker-rollout \
    python3 -B scripts/tests/production_release_regression.py   (CI Release Config)

1. Build digests: four per-leg records → four refs; SHA mismatch, two refs for
   one service, missing service, wrong repository, tag-only ref rejected; the
   same content digest across distinct repos is allowed.
2. Environment gate on synthetic REST documents: the expected protection
   passes; admin bypass, self-review with a sole approver, protected-branches
   policy, wildcard/tag branch rule, unexpected reviewer fail; 404/403 fail
   closed; only GET requests are made.
3. docker-rollout install: a mismatched download leaves the prior plugin
   untouched; a matching one is installed 0755. The reviewed file matches the pin.
4. apply-auto.sh (stub psql runner): default mode is ONE READ ONLY query — no
   CREATE / INSERT / -f — and missing manifest, duplicate entry (before SQL),
   missing ledger (SQL error), unapplied file or SQL error exit non-zero.
5. Reviewed docker-rollout against a fake docker CLI: an unhealthy (readiness)
   replacement is removed and the old container is never stopped; a healthy
   one retires the old. The api healthcheck is /api/v1/health/ready.
6. roll_one: absent service never reaches rollout; a failed api swap re-stamps
   ONLY SENTRY_RELEASE and only when the api is observed old+healthy+prior
   release (new/unhealthy/timeout → manual). recover from an interrupted
   receipt recreates only the selected service on observed state + current
   runtime/CA; unknown other state fails closed; an already-old api still
   reconciles SENTRY_RELEASE + live env/CA; a web recovery never stamps the
   api. SIGTERM to run_group's parent kills the whole local child group and
   fails (no success). Rollback tags re-resolve,
   non-release settings match the protected copy, staging is exact/0700.
   deploy.yml references the environment only from the deploy job, after
   environment-preflight, and prepares the staging dir before the scp.
7. The exact inline staging prep + real tar (scp-action flags, umask 0002):
   root 0700 + parents 0755 survive extraction (root-only prep leaves 0775
   parents → STAGED_UNSAFE); unsafe modes, symlinks, wrong types and a foreign
   owner are rejected unmodified.
"""
import hashlib
import importlib.util
import io
import json
import os
import re
import stat
import subprocess
import sys
import tarfile
import tempfile
import textwrap
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location('pr', os.path.join(ROOT, 'scripts/production-release.py'))
pr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pr)

SHA = 'a' * 40
OTHER_SHA = 'b' * 40
OLD_RELEASE = '60d70aceb199c75370044dd0e7980f22a4ab5ba5'
PINNED_ROLLOUT_SHA256 = pr.ROLLOUT_SHA256
failures = []


def check(name, ok):
    print(('PASS ' if ok else 'FAIL ') + name)
    if not ok:
        failures.append(name)


def fail_code(fn):
    try:
        fn()
    except pr.Fail as e:
        return str(e)
    return None


def digest(n):
    return 'sha256:' + hashlib.sha256(str(n).encode()).hexdigest()


# ------------------------------------------------------------------ 1 digests
def digest_tests(tmp):
    def build(name, records):
        root = os.path.join(tmp, name)
        for service, sha, d in records:
            pr.record_digest(service, pr.IMAGE_REPO + service, sha, d,
                             os.path.join(root, 'release-digest-' + service, service + '.json'))
        return root

    good = [(s, SHA, digest(i)) for i, s in enumerate(pr.SERVICES)]
    refs = pr.collect_digests(build('good', good), SHA)
    check('four build digests collected in rollout order',
          refs.split() == [f'{pr.IMAGE_REPO}{s}@{d}' for s, _, d in good])
    check('collected refs re-parse to exactly the four services', set(pr.parse_images(refs)) == set(pr.SERVICES))
    check('SHA mismatch rejected', fail_code(lambda: pr.collect_digests(
        build('sha', [*good[:3], ('admin-web', OTHER_SHA, digest(9))]), SHA)) == 'DIGEST_SHA_MISMATCH')
    check('two entries for the same service rejected', fail_code(lambda: pr.parse_images(
        refs + ' ' + pr.IMAGE_REPO + 'api@' + digest(7))) == 'IMAGES_DUPLICATE')
    same = pr.collect_digests(build('same', [(s, SHA, digest(0)) for s in pr.SERVICES]), SHA)
    check('same content digest across distinct repos allowed', set(pr.parse_images(same)) == set(pr.SERVICES))
    check('missing service rejected', fail_code(lambda: pr.collect_digests(build('three', good[:3]), SHA))
          == 'IMAGES_COUNT')
    check('wrong repository rejected at record time', fail_code(lambda: pr.record_digest(
        'api', 'ghcr.io/evil/teka-rdc/api', SHA, digest(1), os.path.join(tmp, 'x.json'))) == 'DIGEST_SERVICE')
    check('tag-only (latest/SHA tag) ref rejected', fail_code(lambda: pr.parse_images(
        refs.replace(refs.split()[0], pr.IMAGE_REPO + 'api:latest'))) == 'IMAGE_REF')


# ---------------------------------------------------------------- 2 env gate
GOOD_ENV = {
    'name': 'production', 'can_admins_bypass': False,
    'protection_rules': [
        {'type': 'required_reviewers', 'prevent_self_review': False,
         'reviewers': [{'type': 'User', 'reviewer': {'login': 'ipanga', 'id': 7407149}}]},
        {'type': 'branch_policy'}],
    'deployment_branch_policy': {'protected_branches': False, 'custom_branch_policies': True},
}
GOOD_POLICIES = {'total_count': 1, 'branch_policies': [{'name': 'main', 'type': 'branch'}]}


def env_case(mutate=None, policies=None):
    doc = json.loads(json.dumps(GOOD_ENV))
    if mutate:
        mutate(doc)
    return fail_code(lambda: pr.check_environment(doc, policies or GOOD_POLICIES))


def rr(doc):
    return doc['protection_rules'][0]


def env_gate_tests():
    check('expected production protection accepted', env_case() is None)
    check('admin bypass rejected', env_case(lambda d: d.update(can_admins_bypass=True)) == 'ENV_ADMIN_BYPASS')
    check('prevent_self_review with sole approver rejected (clear code)',
          env_case(lambda d: rr(d).update(prevent_self_review=True)) == 'ENV_SELF_REVIEW_SOLE_APPROVER')
    check('protected-branches policy rejected', env_case(lambda d: d.update(
        deployment_branch_policy={'protected_branches': True, 'custom_branch_policies': False})) == 'ENV_BRANCH_POLICY')
    check('wildcard branch rule rejected', env_case(policies={
        'total_count': 1, 'branch_policies': [{'name': 'main*', 'type': 'branch'}]}) == 'ENV_BRANCH_RULES')
    check('tag rule rejected', env_case(policies={
        'total_count': 1, 'branch_policies': [{'name': 'main', 'type': 'tag'}]}) == 'ENV_BRANCH_RULES')
    check('unexpected extra reviewer rejected', env_case(lambda d: rr(d)['reviewers'].append(
        {'type': 'User', 'reviewer': {'login': 'someone', 'id': 1}})) == 'ENV_REVIEWERS')
    check('reviewer without id rejected', env_case(lambda d: rr(d)['reviewers'][0]['reviewer'].pop('id'))
          == 'ENV_REVIEWERS')
    check('no required reviewers rejected', env_case(lambda d: d['protection_rules'].pop(0)) == 'ENV_REVIEWERS')

    methods = []

    class Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(status):
        def opener(req, timeout=None):
            methods.append(req.get_method())
            if status != 200:
                raise urllib.error.HTTPError(req.full_url, status, 'x', {}, io.BytesIO(b''))
            body = GOOD_POLICIES if 'deployment-branch-policies' in req.full_url else GOOD_ENV
            return Resp(json.dumps(body).encode())
        return opener

    saved_env, saved_open = dict(os.environ), pr.urllib.request.urlopen
    os.environ.update(GH_TOKEN='synthetic-fixture-token', GITHUB_REPOSITORY='ipanga/teka-rdc',
                      GITHUB_REF='refs/heads/main', GITHUB_API_URL='https://api.github.com')
    try:
        results = {}
        for status in (200, 404, 403):
            pr.urllib.request.urlopen = fake_urlopen(status)
            results[status] = fail_code(pr.env_gate)
        os.environ['GITHUB_REF'] = 'refs/heads/develop'
        results['ref'] = fail_code(pr.env_gate)
    finally:
        pr.urllib.request.urlopen = saved_open
        os.environ.clear()
        os.environ.update(saved_env)
    check('env gate passes on expected REST documents', results[200] is None)
    check('missing environment (404) fails closed', results[404] == 'ENV_GATE_MISSING')
    check('unauthorized GET (403) fails closed', results[403] == 'ENV_GATE_UNAUTHORIZED')
    check('non-main ref rejected', results['ref'] == 'ENV_GATE_REF')
    check('gate issues GET requests only', methods and set(methods) == {'GET'})


# ------------------------------------------------------------ 3 plugin install
def plugin_tests(tmp, reviewed):
    plugin = os.path.join(tmp, 'cli-plugins', 'docker-rollout')
    os.makedirs(os.path.dirname(plugin))
    os.chmod(os.path.dirname(plugin), 0o755)  # independent of the local umask
    with open(plugin, 'wb') as f:
        f.write(b'prior plugin')
    pr.ROLLOUT_PLUGIN = plugin
    code = fail_code(lambda: pr.install_rollout_plugin(lambda: b'tampered download'))
    check('mismatched download rejected before install, prior plugin kept',
          code == 'ROLLOUT_PLUGIN_SHA' and open(plugin, 'rb').read() == b'prior plugin')
    pr.ROLLOUT_SHA256 = hashlib.sha256(b'synthetic plugin').hexdigest()
    try:
        pr.install_rollout_plugin(lambda: b'synthetic plugin')
        check('verified download installed atomically 0755', open(plugin, 'rb').read() == b'synthetic plugin'
              and stat.S_IMODE(os.stat(plugin).st_mode) == 0o755
              and os.listdir(os.path.dirname(plugin)) == ['docker-rollout'])
        os.chmod(plugin, 0o775)
        check('group-writable plugin is not trusted', not pr.plugin_ok())
    finally:
        pr.ROLLOUT_SHA256 = PINNED_ROLLOUT_SHA256
    if reviewed:
        with open(reviewed, 'rb') as f:
            check('reviewed docker-rollout matches the pinned SHA256',
                  hashlib.sha256(f.read()).hexdigest() == PINNED_ROLLOUT_SHA256)


# ------------------------------------------------------- 4 apply-auto.sh check
STUB_RUNNER = r"""
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(a) + '\n');
if (process.env.STUB_FAIL === '1') process.exit(3);
const sql = a.join(' ');
if (sql.includes('SELECT filename')) {
  if (process.env.STUB_LEDGER === 'missing') process.exit(3);  // relation does not exist
  console.log(process.env.STUB_APPLIED.split(',').join('\n'));
}
"""


def apply_auto_tests(tmp):
    script = os.path.join(ROOT, 'apps/api/prisma/migrations/apply-auto.sh')
    api = os.path.join(tmp, 'api')
    manual = os.path.join(api, 'prisma/migrations/manual')
    os.makedirs(manual)
    with open(os.path.join(ROOT, 'apps/api/prisma/migrations/manual/auto-apply.list')) as f:
        manifest = f.read()
    entries = [l.split('#')[0].strip() for l in manifest.splitlines() if l.split('#')[0].strip()]
    with open(os.path.join(manual, 'auto-apply.list'), 'w') as f:
        f.write(manifest)
    for e in entries:
        open(os.path.join(manual, e), 'w').close()  # contents never read in check mode
    with open(os.path.join(api, 'prisma/migrations/production-psql.cjs'), 'w') as f:
        f.write(STUB_RUNNER)
    log = os.path.join(tmp, 'psql.log')

    def run(args=(), **over):
        if os.path.exists(log):
            os.unlink(log)
        env = {'PATH': os.environ['PATH'], 'STUB_LOG': log, 'STUB_LEDGER': 'present',
               'STUB_APPLIED': ','.join(entries), **over}
        r = subprocess.run(['sh', script, *args], cwd=api, env=env, stdin=subprocess.DEVNULL,
                           capture_output=True, text=True)
        calls = [json.loads(l) for l in open(log)] if os.path.exists(log) else []
        return r.returncode, calls

    check('manifest has the known 16 entries', len(entries) == 16)
    code, calls = run()
    sql = ' '.join(' '.join(c) for c in calls)
    check('default mode = read-only check passes when all recorded (one query)', code == 0 and len(calls) == 1)
    check('every check query is a READ ONLY transaction',
          calls and all(re.search(r'BEGIN( TRANSACTION)? READ ONLY;', ' '.join(c)) for c in calls))
    check('check mode never CREATEs/INSERTs/executes a file',
          not re.search(r'CREATE|INSERT', sql, re.I) and not any('-f' in c for c in calls))
    check('explicit --check-only same result', run(['--check-only'])[0] == 0)
    code, calls = run(STUB_APPLIED=','.join(entries[:-1]))
    check('unapplied filename stops before rollout', code == 1)
    code, calls = run(STUB_LEDGER='missing')
    check('missing ledger (SQL error) stops without further queries', code == 1 and len(calls) == 1)
    check('SQL error stops', run(STUB_FAIL='1')[0] != 0)
    check('unknown argument rejected', run(['--force'])[0] == 2)
    with open(os.path.join(manual, 'auto-apply.list'), 'w') as f:
        f.write(manifest.rstrip('\n') + '\n' + entries[0] + '\n')
    code, calls = run()
    check('duplicate manifest filename stops before SQL', code == 1 and not calls)
    os.rename(os.path.join(manual, 'auto-apply.list'), os.path.join(manual, 'moved.list'))
    code, calls = run()
    check('missing manifest stops without SQL', code == 1 and not calls)


# ----------------------------------------------- 5 reviewed docker-rollout run
FAKE_DOCKER = r"""
import json, os, sys
path = os.environ['FAKE_DOCKER_STATE']
st = json.load(open(path))
a = sys.argv[1:]
st['calls'].append(a)
out = ''
if a[0] == 'compose':
    if 'ps' in a:
        out = '\n'.join(st['containers'])
    elif 'up' in a:
        st['containers'].append('new1')
elif a[0] == 'inspect':
    status = st['health'][a[-1]]
    out = json.dumps(status if 'Health.Status' in a[1] else {'Status': status})
elif a[0] in ('stop', 'rm'):
    st[a[0]].extend(a[1:])
    if a[0] == 'rm':
        st['containers'] = [c for c in st['containers'] if c not in a[1:]]
json.dump(st, open(path, 'w'))
if out:
    print(out)
"""


def rollout_tests(tmp, reviewed):
    with open(os.path.join(ROOT, 'docker-compose.prod.yml')) as f:
        compose = f.read()
    api_block = compose.split('\n  api:\n', 1)[1].split('\n  buyer-web:\n', 1)[0]
    check('api healthcheck is readiness /api/v1/health/ready (not /live)',
          'http://localhost:5050/api/v1/health/ready' in api_block and '/health/live' not in compose)
    if not reviewed:
        check('reviewed docker-rollout provided (TEKA_REVIEWED_ROLLOUT)', False)
        return
    with open(reviewed, 'rb') as f:
        if hashlib.sha256(f.read()).hexdigest() != PINNED_ROLLOUT_SHA256:
            check('reviewed docker-rollout pinned before execution', False)
            return
    fakebin = os.path.join(tmp, 'fakebin')
    os.mkdir(fakebin)
    docker = os.path.join(fakebin, 'docker')
    with open(docker, 'w') as f:
        f.write('#!' + sys.executable + '\n' + FAKE_DOCKER)
    os.chmod(docker, 0o755)
    state = os.path.join(tmp, 'docker-state.json')

    def run(new_health):
        with open(state, 'w') as f:
            json.dump({'containers': ['old1'], 'health': {'old1': 'healthy', 'new1': new_health},
                       'stop': [], 'rm': [], 'calls': []}, f)
        r = subprocess.run(['sh', reviewed, 'rollout', '-f', 'docker-compose.prod.yml', '--env-file',
                            '.env.production', '-t', '2', '--wait', '1', 'api'], cwd=tmp,
                           env={'PATH': fakebin + os.pathsep + os.environ['PATH'], 'FAKE_DOCKER_STATE': state},
                           stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
        return r.returncode, json.load(open(state))

    code, st = run('unhealthy')
    check('readiness failure: rollout fails, new removed, old api never stopped',
          code != 0 and st['stop'] == ['new1'] and st['rm'] == ['new1'] and st['containers'] == ['old1'])
    code, st = run('healthy')
    check('healthy replacement retires the old api', code == 0 and st['stop'] == ['old1']
          and st['containers'] == ['new1'])


# ------------------------------------------------------- 6 roll_one + workflow
def entry(s, n):
    return {'old_image_id': 'sha256:old-' + s, 'new_image_id': 'sha256:new-' + s, 'old_release': OLD_RELEASE,
            'serving_release': OLD_RELEASE, 'old_ref': pr.IMAGE_REPO + s + '@' + digest(n),
            'new_ref': pr.IMAGE_REPO + s + '@' + digest(n + 10), 'rollback_tag': f'teka-rdc-rollback/{s}:pre-{SHA}'}


def roll_one_tests():
    calls, runtime = [], []
    live = {'image': 'sha256:old-api', 'health': 'healthy', 'release': OLD_RELEASE}
    saved = (pr.running, pr.run_rollout, pr.pc.update_runtime, pr.verify, pr.inspect)
    outcome = [False]
    pr.run_rollout = lambda s, env: calls.append(s) or outcome[0]
    pr.pc.update_runtime = lambda k, v, require_existing: runtime.append((k, v))
    pr.verify = lambda *a: {'ok': True}
    pr.inspect = lambda cid, env: dict(live)
    try:
        receipt = {'services': {s: entry(s, i) for i, s in enumerate(pr.SERVICES)}}
        pr.running = lambda s, env: []
        code = fail_code(lambda: pr.roll_one(receipt, 'buyer-web', SHA, 'sha256:x', {}))
        check('absent service stops before docker-rollout (no fresh start)',
              code == 'SERVICE_ABSENT_BUYER_WEB' and not calls)
        pr.running = lambda s, env: ['c1']
        code = fail_code(lambda: pr.roll_one(receipt, 'api', SHA, 'sha256:x', {}))
        check('failed api swap, observed old+healthy+prior release: re-stamps ONLY SENTRY_RELEASE',
              code == 'ROLLOUT_FAILED_API' and runtime == [('SENTRY_RELEASE', SHA), ('SENTRY_RELEASE', OLD_RELEASE)]
              and receipt['api_release_reconciliation']['status'] == 'old_release_restored')
        runtime.clear()
        live['image'] = 'sha256:new-api'
        code = fail_code(lambda: pr.roll_one(receipt, 'api', SHA, 'sha256:x', {}))
        check('failed api swap, new image observed: no old re-stamp, manual reconciliation',
              code == 'ROLLOUT_FAILED_API' and runtime == [('SENTRY_RELEASE', SHA)]
              and receipt['api_release_reconciliation']['status'] == 'manual_required')
        runtime.clear()
        live.update(image='sha256:old-api', health='unhealthy')
        outcome[0] = None
        code = fail_code(lambda: pr.roll_one(receipt, 'api', SHA, 'sha256:x', {}))
        check('timed-out api swap with unhealthy old: no re-stamp, manual reconciliation',
              code == 'ROLLOUT_TIMEOUT_API' and runtime == [('SENTRY_RELEASE', SHA)]
              and receipt['api_release_reconciliation']['status'] == 'manual_required')
        runtime.clear()
        outcome[0] = False
        code = fail_code(lambda: pr.roll_one(receipt, 'admin-web', SHA, 'sha256:x', {}))
        check('failed web swap leaves the api runtime alone', code == 'ROLLOUT_FAILED_ADMIN_WEB' and not runtime)
    finally:
        pr.running, pr.run_rollout, pr.pc.update_runtime, pr.verify, pr.inspect = saved


def recover_tests():
    """Interrupted (`rolling`) receipt: api new, buyer-web new, others old."""
    images = {'a-new': 'sha256:new-api', 'b-new': 'sha256:new-buyer-web', 's-old': 'sha256:old-seller-web',
              'ad-old': 'sha256:old-admin-web', 'a-old': 'sha256:old-api', 'b-old': 'sha256:old-buyer-web',
              'x': 'sha256:foreign'}
    recreated = {'api': 'a-old', 'buyer-web': 'b-old'}
    names = ('pc.docker_env', 'pc.enter_project', 'pc.update_runtime', 'pc.check_live', 'acquire_lock',
             'load_receipt', 'write_receipt', 'running', 'inspect', 'image_info', 'release_env', 'run_group')
    saved = {n: eval('pr.' + n) for n in names}

    def setup(containers):
        receipt = {'release_sha': SHA, 'phase': 'rolling', 'failed': None, 'recovery': [],
                   'services': {s: entry(s, i) for i, s in enumerate(pr.SERVICES)}}
        log = {'up': [], 'runtime': [], 'live': 0, 'refs': None}

        def run_group(argv, env, timeout):
            log['up'].append(argv)
            containers[argv[-1]] = [recreated[argv[-1]]]
            return True
        pr.pc.docker_env = lambda: {}
        pr.pc.enter_project = lambda: None
        pr.pc.update_runtime = lambda k, v, require_existing: log['runtime'].append((k, v))
        pr.pc.check_live = lambda decoded, env: log.__setitem__('live', log['live'] + 1)
        pr.acquire_lock = lambda: None
        pr.load_receipt = lambda sha, phases: receipt if receipt['phase'] in phases else None
        pr.write_receipt = lambda r: None
        pr.running = lambda s, env: list(containers[s])
        pr.inspect = lambda cid, env: {'image': images[cid], 'health': 'healthy', 'release': OLD_RELEASE}
        pr.image_info = lambda ref, env: ('sha256:old-' + ref.split('/')[-1].split('@')[0].split(':')[0], [])
        pr.release_env = lambda refs, rel: log.__setitem__('refs', dict(refs)) or ({}, {})
        pr.run_group = run_group
        return receipt, log

    try:
        containers = {'api': ['a-new'], 'buyer-web': ['b-new'], 'seller-web': ['s-old'], 'admin-web': ['ad-old']}
        receipt, log = setup(containers)
        pr.recover(SHA, 'api')
        svc = receipt['services']
        check('interrupted receipt: recovery recreates ONLY the selected service (no rollout)',
              log['up'] == [['docker', 'compose', *pr.pc.COMPOSE_ARGS, 'up', '-d', '--no-deps', '--pull', 'never',
                             '--force-recreate', 'api']]
              and containers['buyer-web'] == ['b-new'] and containers['seller-web'] == ['s-old'])
        check('recovery pins observed state, not stale markers; current runtime/CA verified',
              log['refs'] == {'api': svc['api']['old_ref'], 'buyer-web': svc['buyer-web']['new_ref'],
                              'seller-web': svc['seller-web']['old_ref'], 'admin-web': svc['admin-web']['old_ref']}
              and log['runtime'] == [('SENTRY_RELEASE', OLD_RELEASE)] and log['live'] == 1)
        check('recovery recorded; original phase/failure preserved, release not marked complete',
              receipt['recovery'][0]['result'] == 'recovered' and receipt['phase'] == 'recovery'
              and receipt['interrupted_phase'] == 'rolling' and receipt['failed'] is None)
        containers = {'api': ['a-new'], 'buyer-web': ['b-new'], 'seller-web': ['x'], 'admin-web': ['ad-old']}
        receipt, log = setup(containers)
        code = fail_code(lambda: pr.recover(SHA, 'api'))
        check('unknown non-selected state fails closed before any change',
              code == 'RECOVER_STATE_UNKNOWN_SELLER_WEB' and not log['up'] and not log['runtime'])
        containers = {'api': ['a-old'], 'buyer-web': ['b-new'], 'seller-web': ['s-old'], 'admin-web': ['ad-old']}
        receipt, log = setup(containers)
        pr.recover(SHA, 'api')
        check('already-old api (interrupted before rollout): canonical SENTRY_RELEASE reconciled, live env/CA '
              'checked, nothing recreated',
              not log['up'] and log['runtime'] == [('SENTRY_RELEASE', OLD_RELEASE)] and log['live'] == 1
              and receipt['recovery'][0]['result'] == 'already_old')
        containers = {'api': ['a-new'], 'buyer-web': ['b-new'], 'seller-web': ['s-old'], 'admin-web': ['ad-old']}
        receipt, log = setup(containers)
        pr.recover(SHA, 'buyer-web')
        check('web-only recovery never stamps the api release, still verifies canonical api env/CA',
              log['up'][0][-1] == 'buyer-web' and not log['runtime'] and log['live'] == 1
              and containers['api'] == ['a-new'] and receipt['recovery'][0]['result'] == 'recovered')
    finally:
        for n, v in saved.items():
            obj, attr = (pr.pc, n[3:]) if n.startswith('pc.') else (pr, n)
            setattr(obj, attr, v)


INTERRUPT_CHILD = r"""
import os, subprocess, sys, time
os.fstat(int(sys.argv[1]))  # inherited host lock fd (raises if not passed)
g = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])
with open(sys.argv[2] + '.tmp', 'w') as f:
    f.write(f'{os.getpid()} {g.pid}')
os.rename(sys.argv[2] + '.tmp', sys.argv[2])
time.sleep(120)
"""


def run_group_interrupt_tests(tmp):
    """Local subprocess only: SIGTERM to the parent kills + reaps the child
    group, fails (no success) and restores the prior handler."""
    import fcntl
    import signal
    import threading
    import time
    pids = os.path.join(tmp, 'group.pids')
    lock = os.open(os.path.join(tmp, 'group.lock'), os.O_RDWR | os.O_CREAT, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    saved_lock, pr._lock_fd = pr._lock_fd, lock
    prior = signal.signal(signal.SIGTERM, signal.SIG_DFL)

    def interrupt():
        deadline = time.monotonic() + 20
        while not os.path.exists(pids) and time.monotonic() < deadline:
            time.sleep(0.05)
        os.kill(os.getpid(), signal.SIGTERM)

    def gone(pid):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return True
            time.sleep(0.05)
        return False

    try:
        threading.Thread(target=interrupt, daemon=True).start()
        result = {}
        try:
            result['value'] = pr.run_group([sys.executable, '-c', INTERRUPT_CHILD, str(lock), pids], dict(os.environ), 60)
        except pr.Fail as e:
            result['fail'] = str(e)
        leader, grandchild = (int(x) for x in open(pids).read().split()) if os.path.exists(pids) else (0, 0)
        check('parent SIGTERM: whole child group killed + reaped, RELEASE_INTERRUPTED (no success), '
              'lock fd inherited, prior handler restored',
              result == {'fail': 'RELEASE_INTERRUPTED'} and leader and gone(leader) and gone(grandchild)
              and signal.getsignal(signal.SIGTERM) == signal.SIG_DFL)
    finally:
        signal.signal(signal.SIGTERM, prior)
        pr._lock_fd = saved_lock
        os.close(lock)


def snapshot_guard_tests(tmp):
    saved = (pr.pc.docker_capture, pr.image_info, pr.pc.CONF_DIR, pr.STAGING_DIR)
    try:
        pr.pc.docker_capture = lambda args, env, code: ''
        pr.image_info = lambda ref, env: ('sha256:other', [])
        check('rollback tag must resolve to the captured image ID',
              fail_code(lambda: pr.tag_rollback('api', 'sha256:old', SHA, {})) == 'ROLLBACK_TAG_MISMATCH_API')
        pr.pc.CONF_DIR = os.path.join(tmp, 'conf')
        os.makedirs(os.path.join(pr.pc.CONF_DIR, 'releases', SHA))
        protected = {'SENTRY_RELEASE': OLD_RELEASE, 'POSTHOG_HOST': 'https://eu.example'}
        with open(os.path.join(pr.pc.CONF_DIR, 'releases', SHA, 'api-runtime.json'), 'w') as f:
            json.dump({'services': {'api': {'environment': protected}}}, f)
        check('only SENTRY_RELEASE may differ from the protected pre-release copy',
              fail_code(lambda: pr.check_settings_preserved(SHA, {**protected, 'SENTRY_RELEASE': SHA})) is None
              and fail_code(lambda: pr.check_settings_preserved(SHA, {**protected, 'POSTHOG_HOST': 'https://x'}))
              == 'RUNTIME_SETTINGS_CHANGED')
        pr.STAGING_DIR = os.path.join(tmp, 'staging')
        for rel in pr.SYNC_FILES:
            os.makedirs(os.path.dirname(os.path.join(pr.STAGING_DIR, rel)), exist_ok=True)
            open(os.path.join(pr.STAGING_DIR, rel), 'w').close()
        for top, dirs, files in os.walk(pr.STAGING_DIR):
            os.chmod(top, 0o755)
            for n in files:
                os.chmod(os.path.join(top, n), 0o644)
        os.chmod(pr.STAGING_DIR, 0o700)
        ok = fail_code(pr.staged_files) is None and fail_code(
            lambda: pr.check_staged(os.path.join(pr.STAGING_DIR, pr.SYNC_FILES[2]))) is None
        os.chmod(os.path.join(pr.STAGING_DIR, 'scripts'), 0o775)
        group_w = fail_code(lambda: pr.check_staged(os.path.join(pr.STAGING_DIR, pr.SYNC_FILES[2])))
        open(os.path.join(pr.STAGING_DIR, 'extra.sh'), 'w').close()
        check('staging: exactly six files; group-writable dir rejected; extra file rejected',
              ok and group_w == 'STAGED_UNSAFE' and fail_code(pr.staged_files) == 'STAGED_UNEXPECTED')
    finally:
        pr.pc.docker_capture, pr.image_info, pr.pc.CONF_DIR, pr.STAGING_DIR = saved


def staging_prep_tests(tmp):
    """The EXACT inline 'Prepare staging directory on VPS' script (root constant
    swapped for a temp dir) + the real system tar with scp-action's flags
    (drone-scp: `tar -zcf` on the six explicit paths, `tar -zxf -C target`)
    under the host umask 0002. Only the foreign-uid case mocks os.lstat's uid
    (a real foreign owner needs privilege); everything else is real."""
    with open(os.path.join(ROOT, '.github/workflows/deploy.yml')) as f:
        step = f.read().split('Prepare staging directory on VPS', 1)[1].split('Stage production', 1)[0]
    script = textwrap.dedent(step.split('script: |\n', 1)[1].split('\n\n', 1)[0])
    head, rest = script.split('\n', 1)
    opener, body = rest.split('\n', 1)
    body, closer = body.rsplit('\n', 1)
    constant = f"root = '{pr.STAGING_DIR}'"
    check('staging prep step is exactly `set -eu` + one python3 heredoc on the helper staging root',
          (head, opener, closer) == ('set -eu', "python3 -I -B - <<'PY'", 'PY') and body.count(constant) == 1)
    children = ('scripts', 'apps', 'apps/api', 'apps/api/prisma', 'apps/api/prisma/migrations')

    def prep(root, prelude=''):
        run_script = script.replace(constant, f'root = {root!r}').replace(opener + '\n', opener + '\n' + prelude, 1)
        r = subprocess.run(['/bin/sh', '-eu'], input=run_script, capture_output=True, text=True)
        return r.returncode, r.stderr

    def modes(root):
        return [stat.S_IMODE(os.lstat(os.path.join(root, rel) if rel else root).st_mode) for rel in ('',) + children]

    def sha(path):
        with open(path, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()

    unsafe = (1, 'production-release: FAIL STAGING_DIR_UNSAFE\n')
    archive = os.path.join(tmp, 'scp.tar.gz')
    saved_umask, saved_staging = os.umask(0o002), pr.STAGING_DIR
    try:
        # macOS bsdtar would add ._ AppleDouble entries for xattrs; GNU tar ignores this.
        subprocess.run(['tar', '-zcf', archive, *pr.SYNC_FILES], cwd=ROOT, check=True,
                       env={**os.environ, 'COPYFILE_DISABLE': '1'})
        with tarfile.open(archive, 'r:gz') as t:
            members = t.getmembers()
        check('scp archive = the six explicit files, no directory headers',
              all(m.isfile() for m in members) and sorted(m.name for m in members) == sorted(pr.SYNC_FILES))

        pr.STAGING_DIR = os.path.join(tmp, 'unprepared')
        os.mkdir(pr.STAGING_DIR, 0o700)  # what the old step left: root only
        subprocess.run(['tar', '-zxf', archive, '-C', pr.STAGING_DIR], check=True)
        check('root-only prep: tar creates parents 0775 under umask 0002 → STAGED_UNSAFE',
              modes(pr.STAGING_DIR)[1:] == [0o775] * 5 and fail_code(
                  lambda: pr.check_staged(os.path.join(pr.STAGING_DIR, pr.SYNC_FILES[3]))) == 'STAGED_UNSAFE')

        pr.STAGING_DIR = os.path.join(tmp, 'prepared')
        first, again = prep(pr.STAGING_DIR), prep(pr.STAGING_DIR)
        check('prep creates root 0700 + five children 0755 topologically; repeat run accepts them unchanged',
              first == again == (0, '') and modes(pr.STAGING_DIR) == [0o700] + [0o755] * 5)
        subprocess.run(['tar', '-zxf', archive, '-C', pr.STAGING_DIR], check=True)
        check('after real extraction: modes persist, six files staged safely, SHA256 preserved',
              modes(pr.STAGING_DIR) == [0o700] + [0o755] * 5 and fail_code(pr.staged_files) is None
              and all(fail_code(lambda: pr.check_staged(os.path.join(pr.STAGING_DIR, rel))) is None
                      for rel in pr.SYNC_FILES)
              and all(sha(os.path.join(ROOT, rel)) == sha(os.path.join(pr.STAGING_DIR, rel)) for rel in pr.SYNC_FILES))

        def case(name):
            root = os.path.join(tmp, name)
            check(f'{name}: fresh prep', prep(root) == (0, ''))
            return root

        root = case('existing-0750-child')
        os.chmod(os.path.join(root, 'apps'), 0o750)
        check('existing non-writable child (0750) accepted unchanged',
              prep(root) == (0, '') and modes(root)[2] == 0o750)
        for name, rel, mode in (('root-0750', '', 0o750), ('root-0711', '', 0o711),
                                ('child-group-w', 'apps/api', 0o775), ('child-world-w', 'scripts', 0o757)):
            root = case(name)
            target = os.path.join(root, rel) if rel else root
            os.chmod(target, mode)
            check(f'unsafe mode {name} rejected, never modified',
                  prep(root) == unsafe and stat.S_IMODE(os.lstat(target).st_mode) == mode)

        elsewhere = os.path.join(tmp, 'elsewhere')
        os.mkdir(elsewhere, 0o755)
        os.symlink(elsewhere, os.path.join(tmp, 'root-symlink'))
        check('symlinked root rejected', prep(os.path.join(tmp, 'root-symlink')) == unsafe
              and os.listdir(elsewhere) == [])
        root = case('child-symlink')
        os.rmdir(os.path.join(root, 'apps/api/prisma/migrations'))
        os.rmdir(os.path.join(root, 'apps/api/prisma'))
        os.rmdir(os.path.join(root, 'apps/api'))
        os.rmdir(os.path.join(root, 'apps'))
        os.symlink(elsewhere, os.path.join(root, 'apps'))
        check('symlinked child to a safe dir rejected, nothing created through it',
              prep(root) == unsafe and os.listdir(elsewhere) == [])
        root = case('dangling-symlink')
        os.rmdir(os.path.join(root, 'apps/api/prisma/migrations'))
        os.symlink(os.path.join(tmp, 'missing'), os.path.join(root, 'apps/api/prisma/migrations'))
        check('dangling symlink child rejected, target not created',
              prep(root) == unsafe and not os.path.lexists(os.path.join(tmp, 'missing')))
        open(os.path.join(tmp, 'root-file'), 'w').close()
        root = case('child-file')
        os.rmdir(os.path.join(root, 'scripts'))
        open(os.path.join(root, 'scripts'), 'w').close()
        check('wrong type (regular file) rejected for root and child',
              prep(os.path.join(tmp, 'root-file')) == unsafe and prep(root) == unsafe
              and stat.S_ISREG(os.lstat(os.path.join(root, 'scripts')).st_mode))

        root = case('foreign-uid')
        foreign = os.path.join(root, 'apps')
        mock_uid = ('import os\n_lstat = os.lstat\n'
                    f'os.lstat = lambda p: (lambda s: os.stat_result(s[:4] + (s.st_uid + 1,) + s[5:10]) '
                    f'if p == {foreign!r} else s)(_lstat(p))\n')
        check('foreign-owned child rejected (lstat uid mocked; no privilege to chown)',
              prep(root, mock_uid) == unsafe and prep(root) == (0, ''))
    finally:
        os.umask(saved_umask)
        pr.STAGING_DIR = saved_staging


def workflow_tests():
    with open(os.path.join(ROOT, '.github/workflows/deploy.yml')) as f:
        lines = f.read().splitlines()
    job, env_jobs, needs = None, [], {}
    for line in lines:
        m = re.match(r'  ([a-z][a-z-]*):\s*$', line)
        if m:
            job = m.group(1)
        if re.match(r'\s+environment:\s', line):
            env_jobs.append(job)
        m = re.match(r'    needs:\s*(.+)$', line)
        if m:
            needs[job] = m.group(1)
    text = '\n'.join(lines)
    check('only the deploy job references an environment', env_jobs == ['deploy'])
    check('deploy needs environment-preflight + release-images',
          'environment-preflight' in needs.get('deploy', '') and 'release-images' in needs.get('deploy', ''))
    check('rollout plugin not fetched by mutable tag in workflow', 'docker-rollout/v0.9' not in text)
    check('owned 0700 staging dir prepared (never chmod-ed) before the scp',
          0 < text.find('Prepare staging directory on VPS') < text.find('Stage production compose files')
          and 'chmod' not in text.split('Prepare staging directory on VPS', 1)[1].split('Stage production', 1)[0])
    check('deploy never applies migrations', '--apply' not in text and 'apply-auto.sh' not in text
          and pr.SQL_CHECK[-1] == '--check-only')


if __name__ == '__main__':
    reviewed = os.environ.get('TEKA_REVIEWED_ROLLOUT')
    with tempfile.TemporaryDirectory() as tmp:
        tmp = os.path.realpath(tmp)
        digest_tests(tmp)
        env_gate_tests()
        plugin_tests(tmp, reviewed)
        apply_auto_tests(tmp)
        rollout_tests(tmp, reviewed)
        roll_one_tests()
        recover_tests()
        run_group_interrupt_tests(tmp)
        snapshot_guard_tests(tmp)
        staging_prep_tests(tmp)
        workflow_tests()
    print('OK' if not failures else f'{len(failures)} FAILED')
    raise SystemExit(1 if failures else 0)
