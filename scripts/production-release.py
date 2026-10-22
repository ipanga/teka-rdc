#!/usr/bin/env python3
"""Production release helper (Python 3 stdlib only). Reuses the validated
production-compose.py primitives (docker env, runtime/CA checks, quiet docker
calls, fixed `production-compose: FAIL <CODE>` exit 2). No env values, URLs,
passwords or CA bytes are ever printed; docker stderr is discarded.

Runner side (GitHub Actions, no host access):
  record-digest --service S --image REPO --sha SHA --digest D --out FILE
  collect-digests --dir DIR --sha SHA      exactly 4 build-produced digests →
      `images=<4 refs>` in $GITHUB_OUTPUT
  env-gate                                 read-only REST check of the
      `production` environment protection (GH_TOKEN, GITHUB_REPOSITORY, GITHUB_REF)

App host (deploy, in this order; each is bound to the per-release receipt
CONF_DIR/releases/<sha>/receipt.json, dir 0700 / files 0600, host only):
  snapshot --sha SHA --images REFS   BEFORE sync/pull: validated runtime/CA +
      live api env, receipt + protected copies of the current public files
      (modes/hashes), .env.production (0600), api runtime (0600) and CA (0444);
      prior running image IDs tagged teka-rdc-rollback/<svc>:pre-<sha> (tag
      re-resolved to the captured ID). Every service must be running, healthy
      and on a known release (never starts anything).
  install --sha SHA                  promote exactly the six staged public files.
  deploy --sha SHA                   pull the 4 digests, read-only migration
      ledger check (new api image), verified docker-rollout plugin, api
      SENTRY_RELEASE stamp, rollout api → webs, live acceptance (full api env +
      CA, non-release settings unchanged). On the first failure it stops: no
      retry, no whole-stack rollback, no DB change. A failed api swap re-stamps
      SENTRY_RELEASE ONLY when every serving api is observed old + healthy + on
      the prior release; otherwise the receipt says manual reconciliation.
  recover --sha SHA --service SVC    explicit, owner-run, ONE service back to
      its receipt-retained image (current runtime/CA, no DB revert); also from
      an interrupted receipt. Other services must be observed old/new exactly.
  status --sha SHA                   sanitized receipt summary.
snapshot/install/deploy/recover hold a non-blocking host lock (RELEASE_LOCKED).
"""
import fcntl
import hashlib
import importlib.util
import json
import os
import re
import signal
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('production_compose', os.path.join(HERE, 'production-compose.py'))
pc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pc)
Fail = pc.Fail

SERVICES = pc.SERVICES  # rollout order: api first, then the three webs
IMAGE_REPO = 'ghcr.io/ipanga/teka-rdc/'
DIGEST = re.compile(r'sha256:[0-9a-f]{64}\Z')
GIT_SHA = re.compile(r'[0-9a-f]{40}\Z')
STAGING_DIR = '/home/deploy/teka-rdc-staging'
SYNC_FILES = ('docker-compose.prod.yml', 'docker-compose.db-tls.yml', 'scripts/production-compose.py',
              'scripts/production-release.py', 'scripts/run-prod-sql.sh',
              'apps/api/prisma/migrations/production-psql.cjs')
SQL_CHECK = ['run', '--rm', '--no-deps', '-T', 'api', 'sh', 'prisma/migrations/apply-auto.sh', '--check-only']

# Reviewed docker-rollout v0.9 source at an immutable commit (not the tag).
ROLLOUT_URL = ('https://raw.githubusercontent.com/Wowu/docker-rollout/'
               '93a733199a4a02d183ef84d494611ac12ac99024/docker-rollout')
ROLLOUT_SHA256 = 'd89dd76458baa181af272baaeb3584c19997f4f4a38903b177288fd7c534fe06'
ROLLOUT_PLUGIN = os.path.expanduser('~/.docker/cli-plugins/docker-rollout')
LOCK = os.path.join(pc.CONF_DIR, 'release.lock')
SNAPSHOT_PHASES = ('snapshot_started', 'snapshotted', 'synced', 'pulled', 'sql_checked', 'rolling',
                   'completed', 'failed', 'recovery')
RECOVER_PHASES = ('synced', 'pulled', 'sql_checked', 'rolling', 'completed', 'failed', 'recovery')

GITHUB_API = 'https://api.github.com'
REPOSITORY = 'ipanga/teka-rdc'
ENVIRONMENT = 'production'
OWNER_REVIEWER = (7407149, 'ipanga')
# A second approved reviewer would be listed here (id -> login) by a separate
# reviewed change; only then may prevent_self_review be true.
SECOND_REVIEWERS = {}


# ---------------------------------------------------------------- image refs
def check_ref(service, ref):
    if service not in SERVICES or not pc.digest_ref(service).fullmatch(ref or ''):
        raise Fail('IMAGE_REF')
    return ref


def parse_images(text):
    """Whitespace-separated refs → {service: ref}; exactly the 4 services,
    each exactly once (equal content digests across repos are fine)."""
    refs = {}
    for ref in (text or '').split():
        service = ref[len(IMAGE_REPO):].split('@', 1)[0] if ref.startswith(IMAGE_REPO) else ''
        check_ref(service, ref)
        if service in refs:
            raise Fail('IMAGES_DUPLICATE')
        refs[service] = ref
    if set(refs) != set(SERVICES):
        raise Fail('IMAGES_COUNT')
    return refs


def record_digest(service, image, sha, digest, out):
    if service not in SERVICES or image != IMAGE_REPO + service:
        raise Fail('DIGEST_SERVICE')
    if not GIT_SHA.match(sha) or not DIGEST.match(digest):
        raise Fail('DIGEST_VALUE')
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    with open(out, 'x') as f:
        json.dump({'service': service, 'image': image, 'release_sha': sha, 'digest': digest}, f)


def collect_digests(root, sha):
    """root/release-digest-<svc>/<svc>.json (one artifact per matrix leg)."""
    if not GIT_SHA.match(sha):
        raise Fail('RELEASE_SHA')
    try:
        names = sorted(os.listdir(root))
    except OSError:
        raise Fail('DIGESTS_MISSING') from None
    refs = []
    for name in names:
        service = name[len('release-digest-'):] if name.startswith('release-digest-') else ''
        if service not in SERVICES:
            raise Fail('DIGESTS_UNEXPECTED')
        sub = os.path.join(root, name)
        if not os.path.isdir(sub) or os.listdir(sub) != [service + '.json']:
            raise Fail('DIGESTS_UNEXPECTED')
        rec = pc.load_json(os.path.join(sub, service + '.json'), 'DIGEST')
        if not isinstance(rec, dict) or set(rec) != {'service', 'image', 'release_sha', 'digest'}:
            raise Fail('DIGEST_SCHEMA')
        if rec['service'] != service or rec['image'] != IMAGE_REPO + service:
            raise Fail('DIGEST_SERVICE')
        if rec['release_sha'] != sha:
            raise Fail('DIGEST_SHA_MISMATCH')
        if not isinstance(rec['digest'], str) or not DIGEST.match(rec['digest']):
            raise Fail('DIGEST_VALUE')
        refs.append(f"{rec['image']}@{rec['digest']}")
    parsed = parse_images(' '.join(refs))  # exactly 4, no duplicates
    return ' '.join(parsed[s] for s in SERVICES)


# ----------------------------------------------------- environment protection
def check_environment(env_doc, policies_doc):
    """Validate the GET environment + deployment-branch-policies documents."""
    if not isinstance(env_doc, dict) or env_doc.get('name') != ENVIRONMENT:
        raise Fail('ENV_NAME')
    if env_doc.get('can_admins_bypass') is not False:
        raise Fail('ENV_ADMIN_BYPASS')
    rules = env_doc.get('protection_rules')
    if not isinstance(rules, list) or not all(isinstance(r, dict) for r in rules):
        raise Fail('ENV_RULES')
    if any(r.get('type') not in ('required_reviewers', 'wait_timer', 'branch_policy') for r in rules):
        raise Fail('ENV_RULE_UNKNOWN')
    reviewer_rules = [r for r in rules if r.get('type') == 'required_reviewers']
    if len(reviewer_rules) != 1:
        raise Fail('ENV_REVIEWERS')
    approved = {OWNER_REVIEWER[0]: OWNER_REVIEWER[1], **SECOND_REVIEWERS}
    seen = set()
    reviewers = reviewer_rules[0].get('reviewers')
    if not isinstance(reviewers, list):
        raise Fail('ENV_REVIEWERS')
    for item in reviewers:
        who = item.get('reviewer') if isinstance(item, dict) else None
        if (not isinstance(who, dict) or item.get('type') != 'User'
                or who.get('id') not in approved or approved[who['id']] != who.get('login')):
            raise Fail('ENV_REVIEWERS')
        seen.add(who['id'])
    if OWNER_REVIEWER[0] not in seen:
        raise Fail('ENV_REVIEWERS')
    # Sole approver: the owner approves their own dispatched/merged run, which
    # prevent_self_review=true would make impossible (a silent dead gate).
    self_review = reviewer_rules[0].get('prevent_self_review')
    if not isinstance(self_review, bool):
        raise Fail('ENV_REVIEWERS')
    if self_review and not (seen - {OWNER_REVIEWER[0]}):
        raise Fail('ENV_SELF_REVIEW_SOLE_APPROVER')
    policy = env_doc.get('deployment_branch_policy')
    if policy != {'protected_branches': False, 'custom_branch_policies': True}:
        raise Fail('ENV_BRANCH_POLICY')
    if not isinstance(policies_doc, dict):
        raise Fail('ENV_BRANCH_RULES')
    items = policies_doc.get('branch_policies')
    if (policies_doc.get('total_count') != 1 or not isinstance(items, list) or len(items) != 1
            or not isinstance(items[0], dict)
            or items[0].get('name') != 'main' or items[0].get('type') != 'branch'):
        raise Fail('ENV_BRANCH_RULES')


def github_get(path, token):
    req = urllib.request.Request(GITHUB_API + path, method='GET', headers={
        'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'teka-release-env-gate'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read(1 << 20).decode('utf-8'))
    except urllib.error.HTTPError as e:
        raise Fail('ENV_GATE_MISSING' if e.code == 404 else
                   'ENV_GATE_UNAUTHORIZED' if e.code in (401, 403) else 'ENV_GATE_HTTP') from None
    except (urllib.error.URLError, OSError, ValueError):
        raise Fail('ENV_GATE_HTTP') from None


def env_gate():
    token = os.environ.get('GH_TOKEN') or ''
    if not token:
        raise Fail('ENV_GATE_TOKEN')
    if os.environ.get('GITHUB_REPOSITORY') != REPOSITORY:
        raise Fail('ENV_GATE_REPO')
    if os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise Fail('ENV_GATE_REF')
    if os.environ.get('GITHUB_API_URL', GITHUB_API) != GITHUB_API:
        raise Fail('ENV_GATE_API')
    base = f'/repos/{REPOSITORY}/environments/{ENVIRONMENT}'
    check_environment(github_get(base, token), github_get(base + '/deployment-branch-policies?per_page=100', token))


# ------------------------------------------------------------------- receipt
def receipt_dir(sha):
    if not GIT_SHA.match(sha or ''):
        raise Fail('RELEASE_SHA')
    return os.path.join(pc.CONF_DIR, 'releases', sha)


def write_receipt(r):
    d = receipt_dir(r['release_sha'])
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.receipt-')
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(r, f, indent=2, sort_keys=True)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, os.path.join(d, 'receipt.json'))
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def load_receipt(sha, phases):
    d = receipt_dir(sha)
    pc.check_path(d, 0o700, True, 'RECEIPT_DIR')
    pc.check_path(os.path.join(d, 'receipt.json'), 0o600, False, 'RECEIPT')
    r = pc.load_json(os.path.join(d, 'receipt.json'), 'RECEIPT')
    if not isinstance(r, dict) or r.get('release_sha') != sha or set(r.get('services') or {}) != set(SERVICES):
        raise Fail('RECEIPT_SCHEMA')
    if r.get('phase') not in phases:
        raise Fail('RECEIPT_PHASE')
    return r


def summary(r):
    return {'release_sha': r['release_sha'], 'phase': r['phase'], 'failed': r.get('failed'),
            'completed': r.get('completed', []), 'verification': r.get('verification', {}),
            'recovery': r.get('recovery', []), 'interrupted_phase': r.get('interrupted_phase'),
            'api_release_reconciliation': r.get('api_release_reconciliation'),
            'snapshot_files': r.get('snapshot_files', {}),
            'services': {s: {k: v.get(k) for k in ('old_ref', 'old_image_id', 'old_release', 'rollback_tag',
                                                   'new_ref', 'new_image_id', 'serving')}
                         for s, v in r['services'].items()}}


def print_summary(r):
    print('production-release: RECEIPT ' + json.dumps(summary(r), sort_keys=True))


def _copy_private(src, dest, mode=0o600):
    """Copy a regular non-symlink file into the receipt dir; returns sha256."""
    st = os.lstat(src)
    if not stat.S_ISREG(st.st_mode):
        raise Fail('SNAPSHOT_SOURCE_UNSAFE')
    fd = os.open(src, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as f:
        data = f.read()
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(dest, mode)
    return _sha256(data)


_lock_fd = None


def acquire_lock():
    """Host lock shared by snapshot/install/deploy/recover; never waits."""
    global _lock_fd
    pc.check_path(pc.CONF_DIR, 0o700, True, 'RUNTIME_DIR')
    fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        raise Fail('RELEASE_LOCKED') from None
    _lock_fd = fd  # held until the process exits


def runtime_settings(path, code):
    """Decoded protected runtime (or its snapshot copy) minus SENTRY_RELEASE."""
    raw = pc.api_section(pc.load_json(path, code), ['environment'], code)['environment']
    decoded = pc.decode_env(raw, code)
    decoded.pop('SENTRY_RELEASE', None)
    return decoded


def check_settings_preserved(sha, decoded):
    """Every non-release canonical api setting equals the pre-release copy."""
    current = {k: v for k, v in decoded.items() if k != 'SENTRY_RELEASE'}
    if current != runtime_settings(os.path.join(receipt_dir(sha), 'api-runtime.json'), 'SNAPSHOT_RUNTIME'):
        raise Fail('RUNTIME_SETTINGS_CHANGED')


# --------------------------------------------------------------- docker state
def running(service, env):
    return pc.docker_capture(['ps', '-q', '--no-trunc', '--filter', 'status=running',
                              '--filter', 'label=com.docker.compose.project=' + pc.PROJECT,
                              '--filter', 'label=com.docker.compose.service=' + service,
                              '--filter', 'label=com.docker.compose.oneoff=False'], env, 'LIVE_' + _code(service)).split()


def _code(service):
    return service.upper().replace('-', '_')


def inspect(cid, env):
    try:
        info = json.loads(pc.docker_capture(['inspect', cid], env, 'INSPECT'))[0]
        live_env = dict(e.split('=', 1) for e in info['Config']['Env'] or [] if '=' in e)
        return {'image': info['Image'], 'health': ((info['State'].get('Health') or {}).get('Status')),
                'release': live_env.get('SENTRY_RELEASE')}
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        raise Fail('INSPECT') from None


def image_info(ref, env):
    try:
        img = json.loads(pc.docker_capture(['image', 'inspect', ref], env, 'IMAGE_INSPECT'))[0]
        return img['Id'], img.get('RepoDigests') or []
    except (ValueError, KeyError, IndexError, TypeError):
        raise Fail('IMAGE_INSPECT') from None


def require_running(service, env):
    ids = running(service, env)
    if not ids:  # never let docker-rollout "start fresh" silently
        raise Fail('SERVICE_ABSENT_' + _code(service))
    return ids


def observe(service, entry, env):
    """Actual running state vs the receipt's old/new image IDs (never the
    stored `serving` marker). Booleans/labels only, safe for the receipt."""
    ids = running(service, env)
    infos = [inspect(c, env) for c in ids]
    images = {i['image'] for i in infos}
    state = ('absent' if not infos else 'old' if images == {entry.get('old_image_id')}
             else 'new' if entry.get('new_image_id') and images == {entry['new_image_id']}
             else 'mixed' if images <= {entry.get('old_image_id'), entry.get('new_image_id')} else 'unknown')
    releases = {i['release'] for i in infos}
    return {'state': state, 'containers': len(infos), 'ids': sorted(ids),
            'healthy': bool(infos) and all(i['health'] == 'healthy' for i in infos),
            'release': ('old' if releases == {entry.get('old_release')} else
                        'other' if infos else 'none')}


def _public(obs):
    return {k: v for k, v in obs.items() if k != 'ids'}


def verify(service, image_id, release, env):
    """Every running container of the service: expected image, healthy,
    expected SENTRY_RELEASE. Booleans only."""
    infos = [inspect(c, env) for c in require_running(service, env)]
    result = {'containers': len(infos), 'image_match': all(i['image'] == image_id for i in infos),
              'healthy': all(i['health'] == 'healthy' for i in infos),
              'release_match': all(i['release'] == release for i in infos)}
    if not (result['image_match'] and result['healthy'] and result['release_match']):
        raise Fail('VERIFY_' + _code(service))
    return result


# -------------------------------------------------------------- rollout tool
def _sha256(data):
    return hashlib.sha256(data).hexdigest()


def _owned_safe(st, is_dir):
    kind = stat.S_ISDIR(st.st_mode) if is_dir else stat.S_ISREG(st.st_mode)
    return kind and st.st_uid == os.getuid() and not stat.S_IMODE(st.st_mode) & 0o022


def plugin_dir_ok():
    try:
        return _owned_safe(os.lstat(os.path.dirname(ROLLOUT_PLUGIN)), True)
    except FileNotFoundError:
        return None  # absent: install may create it 0700
    except OSError:
        return False


def plugin_ok():
    """Real file owned by us, no group/world write, executable, in a safe
    parent dir, content = the pinned SHA256."""
    try:
        if not plugin_dir_ok():
            return False
        fd = os.open(ROLLOUT_PLUGIN, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as f:
            st = os.fstat(f.fileno())
            return _owned_safe(st, False) and bool(st.st_mode & 0o100) and _sha256(f.read()) == ROLLOUT_SHA256
    except OSError:
        return False


def fetch_rollout():
    try:
        with urllib.request.urlopen(ROLLOUT_URL, timeout=60) as r:
            return r.read(1 << 20)
    except (urllib.error.URLError, OSError):
        raise Fail('ROLLOUT_PLUGIN_DOWNLOAD') from None


def install_rollout_plugin(fetch=fetch_rollout):
    """Download to memory, verify the pinned SHA256, THEN atomically replace.
    A bad/mismatched download leaves any prior plugin untouched."""
    if plugin_ok():
        return
    data = fetch()
    if _sha256(data) != ROLLOUT_SHA256:
        raise Fail('ROLLOUT_PLUGIN_SHA')
    d = os.path.dirname(ROLLOUT_PLUGIN)
    dir_ok = plugin_dir_ok()
    if dir_ok is False:
        raise Fail('ROLLOUT_PLUGIN_UNSAFE')  # never chmod someone else's dir
    if dir_ok is None:
        os.makedirs(d, mode=0o700)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.docker-rollout-')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o755)
        os.replace(tmp, ROLLOUT_PLUGIN)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    if not plugin_ok():
        raise Fail('ROLLOUT_PLUGIN_SHA')


class _Terminated(BaseException):
    pass


def _raise_terminated(signum, frame):
    raise _Terminated(signum)


def _lock_fds():
    try:
        os.fstat(_lock_fd)
        return (_lock_fd,)
    except (TypeError, OSError):
        return ()


def run_group(argv, env, timeout):
    """Run in its own process group. True/False = exit status; None = timed
    out: the WHOLE group is terminated and reaped (no orphan can later act),
    and the caller must treat the resulting state as unknown. The held host
    lock fd is inherited, so the lock lives as long as the child does. On
    SIGTERM/SIGHUP/KeyboardInterrupt the whole group is killed and reaped
    first; signals then fail with RELEASE_INTERRUPTED (never a success)."""
    previous = {s: signal.signal(s, _raise_terminated) for s in (signal.SIGTERM, signal.SIGHUP)}
    p = None
    try:
        p = subprocess.Popen(argv, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True, pass_fds=_lock_fds())
        try:
            return p.wait(timeout=timeout) == 0
        except subprocess.TimeoutExpired:
            pass
        _kill_group(p)
        return None
    except (_Terminated, KeyboardInterrupt) as e:
        for s in previous:  # a repeated signal must not interrupt the reaping
            signal.signal(s, signal.SIG_IGN)
        if p is not None:
            _kill_group(p)
        if isinstance(e, KeyboardInterrupt):
            raise
        raise Fail('RELEASE_INTERRUPTED') from None
    finally:
        for s, h in previous.items():
            signal.signal(s, h)


def _kill_group(p):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(p.pid, sig)
        except ProcessLookupError:
            break
        try:
            p.wait(timeout=15)
        except subprocess.TimeoutExpired:
            pass
    try:
        os.killpg(p.pid, signal.SIGKILL)  # stragglers outliving the leader
    except ProcessLookupError:
        pass
    p.wait()


def run_rollout(service, env):
    """Execute the verified plugin FILE itself (argv[1] `rollout` is what its
    parser expects), never a `docker rollout` lookup that DOCKER_CONFIG or
    cliPluginsExtraDirs could redirect."""
    if not plugin_ok():
        raise Fail('ROLLOUT_PLUGIN_SHA')
    return run_group([ROLLOUT_PLUGIN, 'rollout', *pc.COMPOSE_ARGS, *pc.ROLLOUT_ARGS, service], env, 420)


def release_env(refs, release):
    """Pin all four images + the web SENTRY_RELEASE, then the full validation.
    Returns (env, decoded canonical api env)."""
    for service, ref in refs.items():
        os.environ[pc.IMAGE_VARS[service]] = check_ref(service, ref)
    os.environ['SENTRY_RELEASE'] = release
    os.environ['SENTRY_ENVIRONMENT'] = 'production'
    return pc.validate()


def reconcile_api_release(entry, env):
    """After a failed/timed-out api swap: re-stamp SENTRY_RELEASE ONLY if every
    serving api container is observed on the old image, healthy and on the
    known prior release. Anything else is recorded for manual reconciliation."""
    old_release = entry.get('old_release')
    try:
        obs = observe('api', entry, env)
    except Fail:
        return {'status': 'manual_required', 'observed': 'inspect_failed'}
    if not (obs['state'] == 'old' and obs['healthy'] and obs['release'] == 'old'
            and GIT_SHA.match(old_release or '')):
        return {'status': 'manual_required', 'observed': _public(obs)}
    try:
        pc.update_runtime('SENTRY_RELEASE', old_release, require_existing=True)
    except (Fail, OSError):
        return {'status': 'manual_required', 'observed': _public(obs), 'restamp': 'failed'}
    return {'status': 'old_release_restored', 'observed': _public(obs)}


def roll_one(r, service, release, image_id, env):
    """Swap ONE service. api: stamp SENTRY_RELEASE first; on failure only a
    confirmed old+healthy api gets that one key back (never wholesale)."""
    entry = r['services'][service]
    require_running(service, env)
    if service == 'api':
        pc.update_runtime('SENTRY_RELEASE', release, require_existing=True)
    ok = run_rollout(service, env)
    if ok is not True:
        if service == 'api':
            r['api_release_reconciliation'] = reconcile_api_release(entry, env)
        raise Fail(('ROLLOUT_TIMEOUT_' if ok is None else 'ROLLOUT_FAILED_') + _code(service))
    result = verify(service, image_id, release, env)
    if service == 'api':
        entry['serving_release'] = release
    return result


# ------------------------------------------------------------------ commands
def tag_rollback(service, image_id, sha, env):
    tag = f'teka-rdc-rollback/{service}:pre-{sha}'
    pc.docker_capture(['tag', image_id, tag], env, 'ROLLBACK_TAG')
    if image_info(tag, env)[0] != image_id:
        raise Fail('ROLLBACK_TAG_MISMATCH_' + _code(service))
    return tag


def snapshot(sha, images):
    refs = parse_images(images)
    d = receipt_dir(sha)
    acquire_lock()
    # Protected runtime + CA, effective config AND the live api env/CA mount
    # must all be intact before anything is written or tagged.
    env, decoded = pc.validate()
    pc.check_live(decoded, env)
    root = os.path.dirname(d)
    if not os.path.lexists(root):
        os.mkdir(root, 0o700)
    pc.check_path(root, 0o700, True, 'RECEIPT_ROOT')
    try:
        os.mkdir(d, 0o700)
    except FileExistsError:
        raise Fail('RECEIPT_EXISTS') from None  # no automatic re-run/retry
    os.chmod(d, 0o700)
    r = {'release_sha': sha, 'phase': 'snapshot_started', 'completed': [], 'failed': None,
         'verification': {}, 'recovery': [], 'services': {s: {'new_ref': refs[s]} for s in SERVICES}}
    write_receipt(r)
    try:
        observed = {}
        for service in SERVICES:  # all checks before the first tag
            infos = [inspect(c, env) for c in require_running(service, env)]
            image_ids = {i['image'] for i in infos}
            if len(image_ids) != 1:
                raise Fail('SERVICE_MIXED_' + _code(service))
            if not all(i['health'] == 'healthy' for i in infos):
                raise Fail('SERVICE_UNHEALTHY_' + _code(service))
            releases = {i['release'] for i in infos}
            old_release = releases.pop() if len(releases) == 1 else ''
            if not GIT_SHA.match(old_release or ''):
                raise Fail('OLD_RELEASE_UNKNOWN_' + _code(service))
            image_id = image_ids.pop()
            old = sorted(x for x in image_info(image_id, env)[1] if pc.digest_ref(service).fullmatch(x))
            if not old:
                raise Fail('OLD_DIGEST_UNKNOWN_' + _code(service))
            observed[service] = (image_id, old[0], old_release)
        for service, (image_id, old_ref, old_release) in observed.items():
            r['services'][service].update(old_image_id=image_id, old_ref=old_ref, old_release=old_release,
                                          rollback_tag=tag_rollback(service, image_id, sha, env),
                                          serving='old', serving_release=old_release)
        files = os.path.join(d, 'files')
        os.mkdir(files, 0o700)
        r['snapshot_files'] = {}
        for rel in SYNC_FILES:  # public: modes + hashes may go in the receipt
            if not os.path.lexists(rel):
                r['snapshot_files'][rel] = {'present': False}
                continue
            mode = stat.S_IMODE(os.lstat(rel).st_mode)
            r['snapshot_files'][rel] = {'present': True, 'mode': oct(mode),
                                        'sha256': _copy_private(rel, os.path.join(files, rel.replace('/', '__')))}
        # Protected copies: values stay host-only, never restored wholesale.
        _copy_private('.env.production', os.path.join(d, 'env.production'))
        _copy_private(pc.RUNTIME, os.path.join(d, 'api-runtime.json'))
        _copy_private(pc.CA, os.path.join(d, 'production-ca.crt'), 0o444)
        check_settings_preserved(sha, decoded)  # copy round-trips
        r['phase'] = 'snapshotted'
    except (Fail, OSError) as e:
        r.update(phase='failed', failed={'step': 'snapshot', 'code': str(e) if isinstance(e, Fail) else 'OS_ERROR'})
        raise Fail(r['failed']['code']) from None
    finally:
        write_receipt(r)
        print_summary(r)


def check_staged(path):
    """Staged file + its dirs up to STAGING_DIR: real (no symlink), owned by
    the caller, neither group- nor world-writable (group membership is not
    assumed); STAGING_DIR itself exactly 0700."""
    p = path
    while True:
        try:
            st = os.lstat(p)
        except FileNotFoundError:
            raise Fail('STAGED_MISSING') from None
        if not _owned_safe(st, p != path):
            raise Fail('STAGED_UNSAFE')
        if p == STAGING_DIR:
            if stat.S_IMODE(st.st_mode) != 0o700:
                raise Fail('STAGED_UNSAFE')
            return
        if not p.startswith(STAGING_DIR + '/'):
            raise Fail('STAGED_UNSAFE')
        p = os.path.dirname(p)


def staged_files():
    """Exactly the six expected public files, no symlinks anywhere."""
    found = set()
    for top, dirs, files in os.walk(STAGING_DIR):
        for name in dirs + files:
            if os.path.islink(os.path.join(top, name)):
                raise Fail('STAGED_UNSAFE')
        found.update(os.path.relpath(os.path.join(top, n), STAGING_DIR) for n in files)
    if found != set(SYNC_FILES):
        raise Fail('STAGED_UNEXPECTED')


def install(sha):
    acquire_lock()
    r = load_receipt(sha, ('snapshotted',))
    try:
        staged_files()
        staged = []
        for rel in SYNC_FILES:
            src = os.path.join(STAGING_DIR, rel)
            check_staged(src)
            fd = os.open(src, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'rb') as f:
                staged.append((rel, f.read()))
        for rel, data in staged:
            dest = os.path.join(pc.PROJECT_DIR, rel)
            parent = os.path.dirname(dest)
            if os.path.islink(dest) or os.path.islink(parent) or os.path.realpath(parent) != parent:
                raise Fail('INSTALL_DEST_SYMLINK')
            mode = stat.S_IMODE(os.lstat(dest).st_mode) if os.path.lexists(dest) else (
                0o755 if rel.endswith('.sh') else 0o644)  # existing modes preserved
            fd, tmp = tempfile.mkstemp(dir=parent, prefix='.install-')
            with os.fdopen(fd, 'wb') as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.chmod(tmp, mode)
            os.replace(tmp, dest)
        r['phase'] = 'synced'
    except (Fail, OSError) as e:
        r.update(phase='failed', failed={'step': 'install', 'code': str(e) if isinstance(e, Fail) else 'OS_ERROR'})
        raise Fail(r['failed']['code']) from None
    finally:
        write_receipt(r)
        print_summary(r)


def deploy(sha):
    acquire_lock()
    r = load_receipt(sha, ('synced',))
    refs = {s: r['services'][s]['new_ref'] for s in SERVICES}
    step = 'validate'
    try:
        env, decoded = release_env(refs, sha)
        check_settings_preserved(sha, decoded)
        step = 'pull'
        if subprocess.run(['docker', 'compose', *pc.COMPOSE_ARGS, 'pull', '--quiet', *SERVICES], env=env,
                          stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL).returncode != 0:
            raise Fail('PULL')
        for s in SERVICES:
            image_id, digests = image_info(refs[s], env)
            if refs[s] not in digests:
                raise Fail('PULLED_DIGEST_' + _code(s))
            r['services'][s]['new_image_id'] = image_id
        r['phase'] = 'pulled'
        write_receipt(r)
        step = 'sql_check'  # read-only, inside the NEW api image; stdout = fixed lines
        if subprocess.run(['docker', 'compose', *pc.COMPOSE_ARGS, *SQL_CHECK], env=env,
                          stdin=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
            raise Fail('SQL_CHECK')
        r['phase'] = 'sql_checked'
        step = 'rollout_plugin'
        install_rollout_plugin()  # executed by verified path in run_rollout
        for s in SERVICES:
            step = 'rollout:' + s
            r['phase'] = 'rolling'
            write_receipt(r)
            print(f'production-release: ROLLING {s}')
            env, decoded = release_env(refs, sha)
            r['verification'][s] = roll_one(r, s, sha, r['services'][s]['new_image_id'], env)
            r['services'][s]['serving'] = 'new'
            r['completed'].append(s)
        step = 'acceptance'
        env, decoded = release_env(refs, sha)
        check_settings_preserved(sha, decoded)
        for s in SERVICES:
            r['verification'][s] = verify(s, r['services'][s]['new_image_id'], sha, env)
        pc.check_live(decoded, env)  # full canonical api env + read-only pinned CA
        r['verification']['api_live_env_ca'] = True
        r['phase'] = 'completed'
    except Fail as e:
        r.update(phase='failed', failed={'step': step, 'code': str(e)})
        raise
    finally:
        write_receipt(r)
        print_summary(r)


def recover(sha, service):
    """Owner-run: ONE service back to its receipt-retained image. Works from a
    failed, completed or interrupted (synced/pulled/sql_checked/rolling)
    receipt. Only the selected service is recreated (`up --no-deps --pull
    never --force-recreate`); every other service must be observed exactly
    old or new and is left untouched. No retry, no DB revert; the original
    failure is preserved and the release is never marked complete."""
    if service not in SERVICES:
        raise Fail('USAGE')
    acquire_lock()  # an ongoing snapshot/install/deploy holds it → RELEASE_LOCKED
    r = load_receipt(sha, RECOVER_PHASES)
    entry = r['services'][service]
    old_release = entry.get('old_release')
    if not GIT_SHA.match(old_release or ''):
        raise Fail('RECOVER_RELEASE_UNKNOWN')
    attempt = {'service': service, 'phase_at_start': r['phase'], 'result': 'started'}
    r.setdefault('recovery', []).append(attempt)
    if r['phase'] not in ('failed', 'recovery'):
        r['interrupted_phase'] = r['phase']
    r['phase'] = 'recovery'
    try:
        env = pc.docker_env()
        pc.enter_project()
        refs, before = {}, {}
        for s, v in r['services'].items():
            obs = observe(s, v, env)
            before[s] = obs
            if s == service:
                refs[s] = check_ref(s, v.get('old_ref'))
            elif obs['state'] == 'old':
                refs[s] = check_ref(s, v.get('old_ref'))
            elif obs['state'] == 'new':
                refs[s] = check_ref(s, v.get('new_ref'))
            else:
                raise Fail('RECOVER_STATE_UNKNOWN_' + _code(s))  # fail closed
        attempt['observed_before'] = {s: _public(o) for s, o in before.items()}
        image_id = image_info(entry['rollback_tag'], env)[0]
        if image_id != entry.get('old_image_id') or image_info(entry['old_ref'], env)[0] != image_id:
            raise Fail('RECOVER_IMAGE_MISMATCH')
        sel = before[service]
        already_old = sel['state'] == 'old' and sel['healthy'] and sel['release'] == 'old'
        if service == 'api':  # one key only, current runtime/CA otherwise (also when already old)
            pc.update_runtime('SENTRY_RELEASE', old_release, require_existing=True)
            attempt['runtime_release'] = 'old'
        env, decoded = release_env(refs, old_release)  # current runtime/CA validated on every path
        if not already_old:
            ok = run_group(['docker', 'compose', *pc.COMPOSE_ARGS, 'up', '-d', '--no-deps', '--pull', 'never',
                            '--force-recreate', service], env, 420)
            if ok is not True:
                raise Fail('RECOVER_UP_TIMEOUT' if ok is None else 'RECOVER_UP_FAILED')
            deadline = time.monotonic() + 300
            while True:  # bounded readiness
                try:
                    attempt['verification'] = verify(service, image_id, old_release, env)
                    break
                except Fail:
                    if time.monotonic() > deadline:
                        raise Fail('RECOVER_NOT_READY') from None
                    time.sleep(5)
        # Live api env + CA must equal the canonical runtime on every path
        # (a web recovery never re-stamps it; a mismatch fails, never succeeds).
        pc.check_live(decoded, env)
        attempt['api_live_env_ca'] = True
        for s in SERVICES:
            if s != service and sorted(running(s, env)) != before[s]['ids']:
                raise Fail('RECOVER_OTHER_CHANGED_' + _code(s))
        attempt['result'] = 'already_old' if already_old else 'recovered'
        entry['serving'] = 'old'
        if service == 'api':
            entry['serving_release'] = old_release
    except Fail as e:
        attempt['result'] = 'failed:' + str(e)
        raise
    finally:
        write_receipt(r)
        print_summary(r)


def _opts(argv, names):
    """Exactly `--name value` pairs, in the given order."""
    if len(argv) != 2 * len(names) or argv[0::2] != ['--' + n for n in names]:
        raise Fail('USAGE')
    return argv[1::2]


def main(argv):
    cmd, rest = (argv[0], argv[1:]) if argv else ('', [])
    if cmd == 'record-digest':
        record_digest(*_opts(rest, ['service', 'image', 'sha', 'digest', 'out']))
    elif cmd == 'collect-digests':
        root, sha = _opts(rest, ['dir', 'sha'])
        images = collect_digests(root, sha)
        out = os.environ.get('GITHUB_OUTPUT')
        if not out:
            raise Fail('GITHUB_OUTPUT')
        with open(out, 'a') as f:
            f.write(f'images={images}\n')
        print('production-release: IMAGES ' + images)
    elif cmd == 'env-gate':
        _opts(rest, [])
        env_gate()
        print('production-release: ENV_GATE_OK')
    elif cmd == 'snapshot':
        snapshot(*_opts(rest, ['sha', 'images']))
    elif cmd == 'install':
        install(*_opts(rest, ['sha']))
    elif cmd == 'deploy':
        deploy(*_opts(rest, ['sha']))
    elif cmd == 'recover':
        recover(*_opts(rest, ['sha', 'service']))
    elif cmd == 'status':
        print_summary(load_receipt(_opts(rest, ['sha'])[0], SNAPSHOT_PHASES))
    else:
        raise Fail('USAGE')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Fail as e:
        print(f'production-release: FAIL {e}', file=sys.stderr)
        sys.exit(2)
    except OSError:
        print('production-release: FAIL OS_ERROR', file=sys.stderr)
        sys.exit(2)
