const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api';

// This app's session surface. The API keeps a separate cookie namespace per
// surface (teka_{surface}_access_token, …) so buyer/seller/admin sessions stay
// isolated in one browser. Every request advertises its surface via the
// `X-Teka-Surface` header so the API reads/writes the right cookie set.
export const SURFACE = 'admin';
const SESSION_COOKIE = `teka_${SURFACE}_session`;

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
    .some(
      (c) => c.startsWith(`${SESSION_COOKIE}=`) && c !== `${SESSION_COOKIE}=`,
    );
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
        headers: {
          'Content-Type': 'application/json',
          'X-Teka-Surface': SURFACE,
        },
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

  // FormData bodies (file uploads) must NOT carry an explicit Content-Type —
  // the browser sets the multipart boundary itself. Forcing application/json
  // here previously forced callers to bypass apiFetch with a raw fetch and
  // thus lose the 401 auto-refresh.
  const isFormData =
    typeof FormData !== 'undefined' && options?.body instanceof FormData;

  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        'X-Teka-Surface': SURFACE,
        ...options?.headers,
      },
    });

  let res = await doFetch();

  // Auto-refresh on 401 — mirrors buyer-web/api-client.ts (PR #81).
  // Only attempts when the session-hint cookie is present so guests
  // don't waste a round-trip. Access tokens expire every 15 min; without
  // this retry, admins were getting logged out mid-session whenever any
  // API call landed after the access token died but before the next
  // /me check could rotate it.
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
