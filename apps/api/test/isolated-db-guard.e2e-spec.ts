import { resolveIsolatedDatabaseUrl } from './isolated-db-guard';

// The opt-in PostgreSQL suite must be impossible to aim at a real database.
// Pure function — runs with the regular e2e suite, no database involved.
describe('resolveIsolatedDatabaseUrl (opt-in real-DB guard)', () => {
  const ok = 'postgresql://postgres:secret@127.0.0.1:55432/teka_inventory_test';

  it('accepts a local throwaway test database and caps the pool', () => {
    const url = resolveIsolatedDatabaseUrl({ TEKA_INVENTORY_PG_URL: ok });
    expect(url).toContain('127.0.0.1:55432/teka_inventory_test');
    expect(url).toContain('connection_limit=20');
    for (const host of ['localhost', '[::1]']) {
      expect(() =>
        resolveIsolatedDatabaseUrl({ TEKA_INVENTORY_PG_URL: `postgresql://u@${host}/x_test` }),
      ).not.toThrow();
    }
  });

  it('refuses when unset — it never falls back to DATABASE_URL', () => {
    expect(() =>
      resolveIsolatedDatabaseUrl({ DATABASE_URL: ok }),
    ).toThrow('TEKA_INVENTORY_PG_URL est requis');
  });

  it.each([
    ['a remote host', 'postgresql://u:p@db.example-cloud.com:5432/teka_test'],
    ['a remote IP', 'postgresql://u:p@10.0.0.12:5432/teka_test'],
    ['a host= override to a remote server', 'postgresql://u:p@localhost/teka_test?host=db.example-cloud.com'],
    ['any host= override, even a socket', 'postgresql://u:p@localhost/teka_test?host=/var/run/postgresql'],
    ['a database without "test" in its name', 'postgresql://u:p@127.0.0.1:5432/teka'],
    ['a non-postgres URL', 'mysql://u:p@127.0.0.1/teka_test'],
    ['garbage', 'not a url'],
  ])('refuses %s', (_label, url) => {
    expect(() => resolveIsolatedDatabaseUrl({ TEKA_INVENTORY_PG_URL: url })).toThrow();
  });

  it('refuses the very URL the app is configured with', () => {
    expect(() =>
      resolveIsolatedDatabaseUrl({ TEKA_INVENTORY_PG_URL: ok, DATABASE_URL: ok }),
    ).toThrow('identique à DATABASE_URL');
  });

  it('never echoes credentials in its errors', () => {
    try {
      resolveIsolatedDatabaseUrl({ TEKA_INVENTORY_PG_URL: 'postgresql://u:TopSecret@db.example-cloud.com/teka_test' });
    } catch (err) {
      expect((err as Error).message).not.toContain('TopSecret');
    }
  });
});
