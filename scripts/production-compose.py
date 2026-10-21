#!/usr/bin/env python3
"""Validated production Compose wrapper (host-side, Python 3 stdlib only).

Every production Compose / rollout operation goes through this script so the
api always runs from the host canonical runtime + pinned DB CA (see
docker-compose.db-tls.yml). Before ANY docker mutation it validates:
  - no DOCKER_HOST/DOCKER_CONTEXT diversion; COMPOSE_* env stripped; fixed
    project dir/name, compose file and env-file (no CLI global options);
  - runtime dir 0700, api-runtime.json 0600, CA 0444: owned by the caller,
    no symlinks, parents up to /home/deploy real dirs owned by root/caller and
    not group/world writable; strict JSON schema; DB URL = approved target/user/db with
    strict Prisma TLS params; PGSSLMODE=verify-full; CA sha256 pin;
  - the effective `compose config` api environment equals the runtime exactly,
    the CA is mounted read-only, and the api image is the default `latest` or
    an immutable ghcr.io/ipanga/teka-rdc/api@sha256 digest (TEKA_API_IMAGE);
    web images equal TEKA_{BUYER,SELLER,ADMIN}_WEB_IMAGE digests when set;
  - before `exec`: docker inspect of every running api container (fixed
    project/service labels) shows the canonical env exactly (extras only image
    defaults) and a read-only bind of the pinned CA (canonical or P2 source).
Rendered config, subprocess errors and env values are never printed; failures
are fixed codes (`production-compose: FAIL <CODE>`, exit 2).

Usage (from anywhere on the app host):
  production-compose.py --check            validate only, prints OK
  production-compose.py --rollout SERVICE  docker rollout (same files/project)
  production-compose.py <compose args...>  e.g. pull | ps | exec -T api ...
  production-compose.py --adopt-p2         ONE-TIME, separately authorised:
      stage the canonical runtime + CA from the private P2 target files after
      proving they match the live healthy api. Never touches the container,
      .env.production or the P2 files; prints a boolean-only receipt with
      effective_config_pending. Order: --adopt-p2 (old base still in place),
      then promote the new base/overlay, then --check, before any recreation.
  production-compose.py --set-release SHA  deploy: update ONLY the api's
      SENTRY_RELEASE (40-hex git sha) in the protected runtime.
  production-compose.py --edit-api-setting KEY  owner-attended, private TTY:
      hidden entry of one allowlisted api setting (EDITABLE_SETTINGS).
  Both keep a unique 0600 backup of the previous runtime in CONF_DIR, replace
  atomically, re-validate and restore on failure; nothing is restarted.
`config`/`convert` are blocked (would print secrets); use --check.
"""
import getpass
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from urllib.parse import parse_qsl, unquote, urlsplit

TRUST_ROOT = '/home/deploy'  # protected-path parent checks stop here
PROJECT_DIR = '/home/deploy/teka-rdc'
PROJECT = 'teka-rdc'
CONF_DIR = '/home/deploy/.config/teka-rdc'
RUNTIME = CONF_DIR + '/api-runtime.json'
CA = CONF_DIR + '/production-ca.crt'
CA_SHA256 = 'bb4912352c678e70053270b340b0445395b52d42221961dfd819381abba47c64'
CA_TARGET = '/run/teka-db-ca/ca.crt'
P2_DIR = '/home/deploy/teka-p2-20261020'
P2_IMAGE = ('ghcr.io/ipanga/teka-rdc/api@sha256:'
            'a9a722601485ed39cf0e07f3533d0f80aa744e3772c2119121d86fe4d807a38a')
DEFAULT_IMAGE = 'ghcr.io/ipanga/teka-rdc/api:latest'
DIGEST_IMAGE = re.compile(r'ghcr\.io/ipanga/teka-rdc/api@sha256:[0-9a-f]{64}')
# Deploy (scripts/production-release.py) pins every service to its immutable
# build digest through these; unset keeps the compose default (operator use).
IMAGE_VARS = {'api': 'TEKA_API_IMAGE', 'buyer-web': 'TEKA_BUYER_WEB_IMAGE',
              'seller-web': 'TEKA_SELLER_WEB_IMAGE', 'admin-web': 'TEKA_ADMIN_WEB_IMAGE'}


def digest_ref(service):
    return re.compile(r'ghcr\.io/ipanga/teka-rdc/' + re.escape(service) + r'@sha256:[0-9a-f]{64}')
TARGET = {'host': '10.77.0.3', 'port': 5433, 'db': 'teka_prod', 'user': 'congofoot_user_teka_rdc'}
PRISMA_QUERY = sorted([('sslmode', 'require'), ('sslaccept', 'strict'), ('sslcert', CA_TARGET)])
SERVICES = ('api', 'buyer-web', 'seller-web', 'admin-web')
COMPOSE_ARGS = ['--env-file', '.env.production', '-f', 'docker-compose.prod.yml']
PROJECT_FILES = ('.env.production', 'docker-compose.prod.yml', 'docker-compose.db-tls.yml')
ROLLOUT_ARGS = ['-t', '180', '--wait', '10']  # unchanged deploy health behaviour
OVERRIDE_OPTION = re.compile(
    r'--(file|env-file|project-directory|project-name|profile)(=|\Z)|-[A-Za-z]*[fp]')
ENV_NAME = re.compile(r'[A-Za-z_][A-Za-z0-9_]*\Z')
GIT_SHA = re.compile(r'[0-9a-f]{40}\Z')
EDITABLE_SETTINGS = {  # key -> validator(value) (value already free of CR/LF/NUL)
    'POSTHOG_API_KEY': lambda v: v == '' or not re.search(r'\s', v),
    'POSTHOG_HOST': lambda v: _https_url(v),
    'APP_REVIEW_LOGIN_ENABLED': lambda v: v in ('true', 'false'),
    'APP_REVIEW_BUYER_PHONE_E164': lambda v: v == '' or re.fullmatch(r'\+[1-9][0-9]{7,14}', v) is not None,
    'APP_REVIEW_BUYER_OTP': lambda v: v == '' or re.fullmatch(r'[0-9]{6}', v) is not None,
}


def _https_url(v):
    if re.search(r'\s', v):
        return False
    try:
        u = urlsplit(v)
        u.port
    except ValueError:
        return False
    return u.scheme == 'https' and bool(u.hostname) and not u.username and not u.password


class Fail(Exception):
    pass


def docker_env():
    if os.environ.get('DOCKER_HOST') or os.environ.get('DOCKER_CONTEXT'):
        raise Fail('DOCKER_CONTEXT')
    env = {k: v for k, v in os.environ.items() if not k.startswith('COMPOSE_')}
    env['COMPOSE_PROJECT_NAME'] = PROJECT
    for service, var in IMAGE_VARS.items():
        image = env.get(var)
        if image and not digest_ref(service).fullmatch(image):
            raise Fail('API_IMAGE' if service == 'api' else 'WEB_IMAGE')
    return env


def enter_project(files=PROJECT_FILES):
    os.chdir(PROJECT_DIR)
    if not all(os.path.isfile(f) for f in files):
        raise Fail('PROJECT_FILES')


def docker_capture(args, env, code):
    r = subprocess.run(['docker', *args], env=env, stdin=subprocess.DEVNULL,
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if r.returncode != 0:
        raise Fail(code)
    return r.stdout.decode('utf-8', 'strict')


def check_parents(path, code):
    """Every directory from path's parent up to TRUST_ROOT: real dir (no
    symlink), owned by root or the caller, not group/world writable."""
    d = os.path.dirname(path)
    while True:
        try:
            st = os.lstat(d)
        except FileNotFoundError:
            raise Fail(code + '_PARENT') from None
        if (not stat.S_ISDIR(st.st_mode) or st.st_uid not in (0, os.getuid())
                or stat.S_IMODE(st.st_mode) & 0o022):
            raise Fail(code + '_PARENT')
        if d == TRUST_ROOT:
            return
        if not d.startswith(TRUST_ROOT + '/'):
            raise Fail(code + '_PARENT')
        d = os.path.dirname(d)


def check_path(path, mode, is_dir, code, exact=True):
    check_parents(path, code)
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        raise Fail(code + '_MISSING') from None
    kind_ok = stat.S_ISDIR(st.st_mode) if is_dir else stat.S_ISREG(st.st_mode)
    if stat.S_ISLNK(st.st_mode) or not kind_ok:
        raise Fail(code + '_TYPE')
    if st.st_uid != os.getuid():
        raise Fail(code + '_OWNER')
    perm = stat.S_IMODE(st.st_mode)
    if (perm != mode) if exact else (perm & 0o022):
        raise Fail(code + '_MODE')


def load_json(path, code):
    def no_dupes(pairs):
        keys = [k for k, _ in pairs]
        if len(keys) != len(set(keys)):
            raise ValueError
        return dict(pairs)

    def no_constants(_):
        raise ValueError

    try:
        with open(path, 'rb') as f:
            return json.loads(f.read().decode('utf-8'), object_pairs_hook=no_dupes,
                              parse_constant=no_constants)
    except (OSError, ValueError):
        raise Fail(code + '_JSON') from None


def api_section(data, keys, code):
    """{"services":{"api":{<exactly keys>}}} → api dict."""
    if not isinstance(data, dict) or set(data) != {'services'}:
        raise Fail(code + '_SCHEMA')
    services = data['services']
    if not isinstance(services, dict) or set(services) != {'api'}:
        raise Fail(code + '_SCHEMA')
    api = services['api']
    if not isinstance(api, dict) or set(api) != set(keys):
        raise Fail(code + '_SCHEMA')
    return api


def decode_env(env, code):
    """Compose-escaped env ($ written $$) → literal values. Multiline is fine."""
    if not isinstance(env, dict) or not env:
        raise Fail(code + '_SCHEMA')
    out = {}
    for k, v in env.items():
        if not ENV_NAME.match(k) or not isinstance(v, str) or '\0' in v or '\0' in k:
            raise Fail(code + '_VALUE')
        if '$' in v.replace('$$', ''):
            raise Fail(code + '_DOLLAR')
        out[k] = v.replace('$$', '$')
    return out


def check_db_env(env):
    url = env.get('DATABASE_URL', '')
    if re.search(r'[\s\\]', url):
        raise Fail('DB_URL_INVALID')
    try:
        u = urlsplit(url)
        port = u.port
        query = sorted(parse_qsl(u.query, keep_blank_values=True, strict_parsing=True))
    except ValueError:
        raise Fail('DB_URL_INVALID') from None
    if (u.scheme != 'postgresql' or u.hostname != TARGET['host'] or port != TARGET['port']
            or u.path != '/' + TARGET['db'] or unquote(u.username or '') != TARGET['user']
            or not u.password or u.fragment):
        raise Fail('DB_TARGET_MISMATCH')
    if query != PRISMA_QUERY:
        raise Fail('DB_TLS_PARAMS')
    if env.get('PGSSLMODE') != 'verify-full' or env.get('PGSSLROOTCERT') != CA_TARGET:
        raise Fail('PG_TLS_ENV')


def sha256_file(path):
    with open(path, 'rb') as f:
        data = f.read()
    return hashlib.sha256(data).hexdigest(), data


def load_runtime():
    check_path(CONF_DIR, 0o700, True, 'RUNTIME_DIR')
    check_path(RUNTIME, 0o600, False, 'RUNTIME')
    check_path(CA, 0o444, False, 'CA')
    raw = api_section(load_json(RUNTIME, 'RUNTIME'), ['environment'], 'RUNTIME')['environment']
    decoded = decode_env(raw, 'RUNTIME')
    check_db_env(decoded)
    if sha256_file(CA)[0] != CA_SHA256:
        raise Fail('CA_PIN')
    return raw, decoded


def check_effective(raw, decoded, env):
    out = docker_capture(['compose', *COMPOSE_ARGS, 'config', '--format', 'json'], env, 'COMPOSE_CONFIG')
    try:
        services = json.loads(out)['services']
        api = services['api']
        effective = api.get('environment') or {}
        web_images = {s: services[s].get('image') for s in SERVICES if s != 'api'}
    except (ValueError, KeyError, TypeError, AttributeError):
        raise Fail('COMPOSE_CONFIG') from None
    for service, image in web_images.items():
        if image != (env.get(IMAGE_VARS[service]) or f'ghcr.io/ipanga/teka-rdc/{service}:latest'):
            raise Fail('WEB_IMAGE')
    # `config` may keep `$$` escaping or render literals; it must match one
    # encoding consistently across ALL values.
    if effective != raw and effective != decoded:
        raise Fail('API_ENV_DRIFT')
    if api.get('env_file'):
        raise Fail('API_ENV_FILE')
    image = api.get('image')
    if image != DEFAULT_IMAGE and not DIGEST_IMAGE.fullmatch(image or ''):
        raise Fail('API_IMAGE')
    if env.get('TEKA_API_IMAGE') and image != env['TEKA_API_IMAGE']:
        raise Fail('API_IMAGE')
    mounts = [v for v in api.get('volumes') or [] if isinstance(v, dict) and v.get('target') == CA_TARGET]
    if (len(mounts) != 1 or mounts[0].get('type') != 'bind' or mounts[0].get('source') != CA
            or mounts[0].get('read_only') is not True
            or (mounts[0].get('bind') or {}).get('create_host_path') is True):
        raise Fail('CA_MOUNT')


def validate():
    env = docker_env()
    enter_project()
    raw, decoded = load_runtime()
    check_effective(raw, decoded, env)
    return env, decoded


def check_live(decoded, env, adopt=False):
    """docker inspect only: every running api container of the fixed project
    has exactly the canonical env (extras only image defaults) and a read-only
    bind of the pinned CA from the canonical or the current P2 source."""
    ids = docker_capture(['ps', '-q', '--no-trunc',
                          '--filter', 'label=com.docker.compose.project=' + PROJECT,
                          '--filter', 'label=com.docker.compose.service=api'], env, 'LIVE_API').split()
    if not ids or (adopt and len(ids) != 1):
        raise Fail('LIVE_API_COUNT')
    for cid in ids:
        try:
            info = json.loads(docker_capture(['inspect', cid], env, 'LIVE_API'))[0]
            state, config, mounts = info['State'], info['Config'], info['Mounts']
            labels = config.get('Labels') or {}
            image = json.loads(docker_capture(['image', 'inspect', info['Image']], env, 'LIVE_IMAGE'))[0]
            live_env = dict(e.split('=', 1) for e in config['Env'] if '=' in e)
            base_env = dict(e.split('=', 1) for e in image['Config']['Env'] or [] if '=' in e)
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            raise Fail('LIVE_API_INSPECT') from None
        if (labels.get('com.docker.compose.project') != PROJECT
                or labels.get('com.docker.compose.service') != 'api'):
            raise Fail('LIVE_API_LABELS')
        if state.get('Running') is not True or (
                adopt and (state.get('Health') or {}).get('Status') != 'healthy'):
            raise Fail('LIVE_API_HEALTH')
        if adopt and config.get('Image') != P2_IMAGE:
            raise Fail('LIVE_API_IMAGE')
        if any(live_env.get(k) != v for k, v in decoded.items()) or any(
                k not in decoded and base_env.get(k) != v for k, v in live_env.items()):
            raise Fail('LIVE_ENV_DRIFT')
        ca_mounts = [m for m in mounts if isinstance(m, dict) and m.get('Destination') == CA_TARGET]
        if (len(ca_mounts) != 1 or ca_mounts[0].get('Type') != 'bind' or ca_mounts[0].get('RW') is not False
                or ca_mounts[0].get('Source') not in (CA, P2_DIR + '/production-ca.crt')):
            raise Fail('LIVE_CA_MOUNT')
        try:
            if sha256_file(ca_mounts[0]['Source'])[0] != CA_SHA256:
                raise Fail('LIVE_CA_MISMATCH')
        except OSError:
            raise Fail('LIVE_CA_MISMATCH') from None


def adopt_p2():
    # Stage FIRST: the old base + env file are still the live layout; the new
    # base/overlay are promoted afterwards, then --check, then any recreation.
    env = docker_env()
    enter_project(('.env.production', 'docker-compose.prod.yml'))
    if os.path.lexists(RUNTIME) or os.path.lexists(CA):
        raise Fail('DEST_EXISTS')
    conf_exists = os.path.lexists(CONF_DIR)
    if conf_exists:
        check_path(CONF_DIR, 0o700, True, 'RUNTIME_DIR')
    else:
        check_parents(os.path.dirname(CONF_DIR), 'RUNTIME_DIR')
        if os.path.lexists(os.path.dirname(CONF_DIR)):
            check_path(os.path.dirname(CONF_DIR), 0, True, 'RUNTIME_DIR', exact=False)

    # Private P2 source (read-only use): schema, dollars round-trip, TLS, CA pin.
    check_path(P2_DIR, 0o700, True, 'P2_DIR')
    src = P2_DIR + '/p2-target-override.yml'
    src_ca = P2_DIR + '/production-ca.crt'
    check_path(src, 0o600, False, 'P2_SOURCE')
    check_path(src_ca, 0o444, False, 'P2_CA')
    api = api_section(load_json(src, 'P2_SOURCE'), ['image', 'environment'], 'P2_SOURCE')
    if api['image'] != P2_IMAGE:
        raise Fail('P2_IMAGE')
    raw = api['environment']
    decoded = decode_env(raw, 'P2_ENV')
    if {k: v.replace('$', '$$') for k, v in decoded.items()} != raw:
        raise Fail('P2_ENV_DOLLAR')
    check_db_env(decoded)
    ca_digest, ca_bytes = sha256_file(src_ca)
    if ca_digest != CA_SHA256:
        raise Fail('P2_CA_PIN')

    # Live api: exactly one healthy running container, P2 image, same full env.
    check_live(decoded, env, adopt=True)

    content = json.dumps({'services': {'api': {'environment': raw}}}, indent=2, sort_keys=True) + '\n'
    if decode_env(json.loads(content)['services']['api']['environment'], 'STAGED') != decoded:
        raise Fail('STAGE_ROUNDTRIP')

    # Stage atomically: temp files in the 0700 dir, then hard-link (fails if the
    # destination appeared meanwhile). Any failure removes everything staged.
    created_dir, linked, tmps = False, [], []
    try:
        if not conf_exists:
            os.makedirs(os.path.dirname(CONF_DIR), mode=0o700, exist_ok=True)
            os.mkdir(CONF_DIR, 0o700)
            created_dir = True
            os.chmod(CONF_DIR, 0o700)
        for dest, data, mode in ((CA, ca_bytes, 0o444), (RUNTIME, content.encode('utf-8'), 0o600)):
            fd, tmp = tempfile.mkstemp(dir=CONF_DIR, prefix='.adopt-')
            tmps.append(tmp)
            with os.fdopen(fd, 'wb') as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.chmod(tmp, mode)
            os.link(tmp, dest)
            linked.append(dest)
        for tmp in tmps:
            os.unlink(tmp)
        tmps = []
        if load_runtime()[1] != decoded:  # staged files only; effective config
            raise Fail('STAGE_ROUNDTRIP')  # is checked by --check after promotion
    except BaseException:
        for p in linked + tmps:
            try:
                os.unlink(p)
            except OSError:
                pass
        if created_dir:
            try:
                os.rmdir(CONF_DIR)
            except OSError:
                pass
        raise
    receipt = dict.fromkeys(['p2_source_schema_ok', 'p2_ca_pin_ok', 'db_target_tls_ok',
                             'live_api_single_healthy', 'live_api_image_p2', 'live_env_exact',
                             'live_ca_mount_readonly_match', 'runtime_staged', 'ca_staged',
                             'effective_config_pending'], True)
    receipt.update(live_container_modified=False, env_production_modified=False, p2_files_modified=False)
    print(json.dumps(receipt, sort_keys=True))


def _write_private(prefix, data):
    fd, tmp = tempfile.mkstemp(dir=CONF_DIR, prefix=prefix)  # unique, 0600
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
    except BaseException:
        os.unlink(tmp)
        raise
    return tmp


def _fsync_dir():
    fd = os.open(CONF_DIR, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def update_runtime(key, value, require_existing):
    """Set ONE api env key in the protected runtime; every other value stays
    identical. Validated before/after; restored atomically on failure. Never
    restarts, recreates or queries anything. Returns the previous value."""
    env = docker_env()
    enter_project()
    raw, decoded = load_runtime()
    check_effective(raw, decoded, env)
    if require_existing and key not in raw:
        raise Fail('UPDATE_KEY_MISSING')
    previous = decoded.get(key)
    with open(RUNTIME, 'rb') as f:
        original = f.read()
    new_raw = dict(raw)
    new_raw[key] = value.replace('$', '$$')
    expected = dict(decoded)
    expected[key] = value
    content = json.dumps({'services': {'api': {'environment': new_raw}}}, indent=2, sort_keys=True) + '\n'
    if decode_env(json.loads(content)['services']['api']['environment'], 'UPDATE') != expected:
        raise Fail('UPDATE_ROUNDTRIP')
    _write_private('api-runtime.json.bak-', original)  # kept: previous runtime
    os.replace(_write_private('.update-', content.encode('utf-8')), RUNTIME)
    _fsync_dir()
    try:
        raw2, decoded2 = load_runtime()
        if decoded2 != expected:
            raise Fail('UPDATE_ROUNDTRIP')
        check_effective(raw2, decoded2, env)
    except (Fail, OSError):
        os.replace(_write_private('.restore-', original), RUNTIME)
        _fsync_dir()
        raise Fail('UPDATE_INVALID_RESTORED') from None
    return previous


def set_release(sha):
    if not GIT_SHA.match(sha):
        raise Fail('RELEASE_SHA')
    previous = update_runtime('SENTRY_RELEASE', sha, require_existing=True)
    shown = previous if GIT_SHA.match(previous or '') else 'unrecognized'
    print(f'production-compose: RELEASE_UPDATED previous={shown} new={sha}')


def edit_api_setting(key):
    check = EDITABLE_SETTINGS.get(key)
    if check is None:
        raise Fail('SETTING_NOT_ALLOWED')
    if not (os.isatty(0) and os.isatty(2)):
        raise Fail('SETTING_TTY')
    try:
        value = getpass.getpass('New value (hidden, empty = clear): ')
        if getpass.getpass('Confirm (hidden): ') != value:
            raise Fail('SETTING_CONFIRM')
    except (EOFError, KeyboardInterrupt):
        raise Fail('SETTING_ABORTED') from None
    if any(c in value for c in '\r\n\0') or not check(value):
        raise Fail('SETTING_VALUE')
    update_runtime(key, value, require_existing=False)
    print(f'production-compose: SETTING_UPDATED {key}')


def main(argv):
    if not argv:
        raise Fail('USAGE')
    if argv[0] == '--set-release':
        if len(argv) != 2:
            raise Fail('USAGE')
        set_release(argv[1])
        return 0
    if argv[0] == '--edit-api-setting':
        if len(argv) != 2:
            raise Fail('USAGE')
        edit_api_setting(argv[1])
        return 0
    if argv[0] == '--check':
        if len(argv) != 1:
            raise Fail('USAGE')
        validate()
        print('production-compose: OK')
        return 0
    if argv[0] == '--adopt-p2':
        if len(argv) != 1:
            raise Fail('USAGE')
        adopt_p2()
        return 0
    if argv[0] == '--rollout':
        if len(argv) != 2 or argv[1] not in SERVICES:
            raise Fail('USAGE')
        env = validate()[0]
        os.execvpe('docker', ['docker', 'rollout', *COMPOSE_ARGS, *ROLLOUT_ARGS, argv[1]], env)
    # Cobra accepts persistent Compose flags after the subcommand too: reject
    # file/env-file/project/profile overrides anywhere (incl. =value, -fX, -Xp).
    if argv[0].startswith('-') or any(OVERRIDE_OPTION.match(a) for a in argv):
        raise Fail('GLOBAL_OPTION')
    if argv[0] in ('config', 'convert'):
        raise Fail('CONFIG_BLOCKED')
    env, decoded = validate()
    if argv[0] == 'exec':  # SQL/seed/backfill run in the live container
        check_live(decoded, env)
    os.execvpe('docker', ['docker', 'compose', *COMPOSE_ARGS, *argv], env)


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Fail as e:
        print(f'production-compose: FAIL {e}', file=sys.stderr)
        sys.exit(2)
    except OSError:
        print('production-compose: FAIL OS_ERROR', file=sys.stderr)
        sys.exit(2)
