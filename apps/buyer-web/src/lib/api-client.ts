const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api';

interface ApiErrorData {
  error?: {
    message?: string;
    status?: number;
    errors?: Record<string, string[]>;
  };
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(data: ApiErrorData) {
    super(data?.error?.message || 'Une erreur est survenue');
    this.status = data?.error?.status || 500;
    this.errors = data?.error?.errors;
  }
}

/**
 * Returns true when the non-HttpOnly `teka_session=1` hint cookie is
 * present — i.e. the user has an active session whose access token may
 * have expired but whose refresh token is still alive. JS can't read the
 * HttpOnly access/refresh tokens, so this hint cookie is the only way
 * for the client to know whether a refresh attempt is worth trying.
 */
function hasSessionHint(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .some((c) => c.startsWith('teka_session=') && c !== 'teka_session=');
}

// Concurrent-safe refresh: if N requests 401 at the same time, they all
// await the SAME refresh attempt instead of stampeding the API with N
// refresh calls (which would also rotate the refresh token N times and
// risk a race).
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Clear after the current microtask so any callers that 401ed
      // *during* this refresh get a fresh attempt next time.
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();
  return refreshPromise;
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{ success: boolean; data: T; message?: string }> {
  // Auth refresh is itself disabled for the refresh endpoint to avoid
  // an infinite loop if the refresh token is also dead.
  const isRefreshCall = path === '/v1/auth/refresh';

  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

  let res = await doFetch();

  // Auto-refresh on 401. Only attempt when:
  //   - it's not the refresh call itself (loop guard)
  //   - the session-hint cookie is present (avoids wasting a network
  //     round-trip on requests that 401 because the user is genuinely
  //     logged out — most likely a guest hitting an auth-required route)
  // Access tokens live for 15 minutes; without this retry, the buyer-web
  // auth-store sets user=null on the next /me call whenever the token
  // expires mid-session, which manifested as "buyer gets logged out
  // after navigation".
  if (res.status === 401 && !isRefreshCall && hasSessionHint()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    }
  }

  const json = await res.json();

  if (!res.ok) {
    throw new ApiError(json);
  }

  return json;
}
