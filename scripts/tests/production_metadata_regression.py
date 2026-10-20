#!/usr/bin/env python3
"""Focused local regression for production-compose.py --set-release and
--edit-api-setting. Stdlib only; synthetic runtime in a temp dir; no Docker,
no real env. Path/effective-config checks are stubbed (covered elsewhere)."""
import hashlib
import importlib.util
import json
import os
import stat
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pc', os.path.join(HERE, '..', 'production-compose.py'))
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)

OLD = '60d70aceb199c75370044dd0e7980f22a4ab5ba5'
NEW = 'a' * 40
RAW = {
    'DATABASE_URL': ('postgresql://congofoot_user_teka_rdc:pa$$w0rd@10.77.0.3:5433/teka_prod'
                     '?sslmode=require&sslaccept=strict&sslcert=/run/teka-db-ca/ca.crt'),
    'PGSSLMODE': 'verify-full',
    'PGSSLROOTCERT': '/run/teka-db-ca/ca.crt',
    'JWT_SECRET': 'syn$$thetic$$$$secret',
    'PRIVATE_KEY': '-----BEGIN-----\nline$$1\nline2\n-----END-----',
    'SENTRY_RELEASE': OLD,
    'APP_REVIEW_BUYER_OTP': '123456',
}
failures = []


def check(cond, name):
    print(('ok   ' if cond else 'FAIL ') + name)
    if not cond:
        failures.append(name)


def expect_fail(fn, code, name):
    try:
        fn()
    except pc.Fail as e:
        check(str(e) == code, name)
        return
    check(False, name)


tmp = tempfile.mkdtemp()
os.chmod(tmp, 0o700)
pc.CONF_DIR, pc.RUNTIME, pc.CA = tmp, tmp + '/api-runtime.json', tmp + '/ca.crt'
with open(pc.CA, 'wb') as f:
    f.write(b'synthetic-ca')
pc.CA_SHA256 = hashlib.sha256(b'synthetic-ca').hexdigest()
pc.check_path = lambda *a, **k: None
pc.docker_env = lambda: {}
pc.enter_project = lambda *a: None
effective_calls = []


def fake_effective(raw, decoded, env):
    effective_calls.append(dict(decoded))
    if fail_after and len(effective_calls) > 1:
        raise pc.Fail('API_ENV_DRIFT')


pc.check_effective = fake_effective


def reset():
    global fail_after
    fail_after = False
    effective_calls.clear()
    for n in os.listdir(tmp):
        if n.startswith('api-runtime.json'):
            os.unlink(os.path.join(tmp, n))
    with open(pc.RUNTIME, 'w') as f:
        json.dump({'services': {'api': {'environment': RAW}}}, f, indent=2, sort_keys=True)
        f.write('\n')
    os.chmod(pc.RUNTIME, 0o600)
    with open(pc.RUNTIME, 'rb') as f:
        return f.read()


def env_now():
    return pc.load_runtime()


def backups():
    return [os.path.join(tmp, n) for n in os.listdir(tmp) if n.startswith('api-runtime.json.bak-')]


# 1. set-release changes exactly one field; dollars/multiline/secrets preserved.
original = reset()
before_raw, before = env_now()
pc.set_release(NEW)
after_raw, after = env_now()
check(after['SENTRY_RELEASE'] == NEW, 'release updated')
check({k: v for k, v in after.items() if k != 'SENTRY_RELEASE'}
      == {k: v for k, v in before.items() if k != 'SENTRY_RELEASE'}, 'other decoded values identical')
check({k: v for k, v in after_raw.items() if k != 'SENTRY_RELEASE'}
      == {k: v for k, v in RAW.items() if k != 'SENTRY_RELEASE'}, 'other raw ($$) values identical')
check(set(after) == set(before), 'no keys added/removed')
check(stat.S_IMODE(os.stat(pc.RUNTIME).st_mode) == 0o600, 'runtime stays 0600')
b = backups()
check(len(b) == 1 and stat.S_IMODE(os.stat(b[0]).st_mode) == 0o600, 'one 0600 backup')
check(open(b[0], 'rb').read() == original, 'backup is byte-identical original')
check(len(effective_calls) == 2, 'effective config validated before and after')

# 2. SHA validation.
for bad in ('A' * 40, 'a' * 39, 'a' * 41, OLD + '\n', ''):
    expect_fail(lambda: pc.set_release(bad), 'RELEASE_SHA', 'reject sha %r' % bad)

# 3. Failed candidate validation restores the original atomically.
original = reset()
fail_after = True
expect_fail(lambda: pc.set_release(NEW), 'UPDATE_INVALID_RESTORED', 'failed candidate -> fixed error')
check(open(pc.RUNTIME, 'rb').read() == original, 'original restored byte-identical')
check(stat.S_IMODE(os.stat(pc.RUNTIME).st_mode) == 0o600, 'restored runtime 0600')
check(not [n for n in os.listdir(tmp) if n.startswith('.')], 'no temp files left')

# 4. Setting allowlist: DB/TLS/other keys cannot be edited; values validated.
pc.os.isatty = lambda fd: True
answers = []
pc.getpass.getpass = lambda prompt='': answers.pop(0)
for key in ('DATABASE_URL', 'PGSSLMODE', 'PGSSLROOTCERT', 'SENTRY_RELEASE', 'JWT_SECRET', 'TEKA_API_IMAGE'):
    original = reset()
    answers[:] = ['x', 'x']
    expect_fail(lambda: pc.edit_api_setting(key), 'SETTING_NOT_ALLOWED', 'reject edit of ' + key)
    check(open(pc.RUNTIME, 'rb').read() == original, key + ' runtime untouched')
for key, val in (('APP_REVIEW_BUYER_OTP', '12345'), ('APP_REVIEW_LOGIN_ENABLED', 'yes'),
                 ('POSTHOG_HOST', 'http://eu.posthog.com'), ('APP_REVIEW_BUYER_PHONE_E164', '0991234567'),
                 ('POSTHOG_API_KEY', 'ab\ncd')):
    original = reset()
    answers[:] = [val, val]
    expect_fail(lambda: pc.edit_api_setting(key), 'SETTING_VALUE', 'reject invalid ' + key)
    check(open(pc.RUNTIME, 'rb').read() == original and not backups(), key + ' untouched on invalid')
reset()
answers[:] = ['654321', '654320']
expect_fail(lambda: pc.edit_api_setting('APP_REVIEW_BUYER_OTP'), 'SETTING_CONFIRM', 'confirmation mismatch')
before = env_now()[1]
answers[:] = ['', '']
pc.edit_api_setting('APP_REVIEW_BUYER_OTP')
after = env_now()[1]
check(after['APP_REVIEW_BUYER_OTP'] == '' and {k: v for k, v in after.items() if k != 'APP_REVIEW_BUYER_OTP'}
      == {k: v for k, v in before.items() if k != 'APP_REVIEW_BUYER_OTP'}, 'explicit empty clears only that key')
pc.os.isatty = lambda fd: False
expect_fail(lambda: pc.edit_api_setting('POSTHOG_HOST'), 'SETTING_TTY', 'non-TTY rejected')

print('%d failure(s)' % len(failures))
sys.exit(1 if failures else 0)
