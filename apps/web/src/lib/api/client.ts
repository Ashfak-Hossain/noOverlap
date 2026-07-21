import { ApiError, type ProblemDetails } from './problem';
import { getAccessToken, setAccessToken } from './token';

/**
 * Requests go to `/api/*`, which the dev server proxies to the API. Same-origin in both development
 * and production, so the refresh cookie is sent without any CORS arrangement.
 */
const BASE = '/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Set internally to stop a refresh failure from triggering another refresh. */
  retryOnUnauthorized?: boolean;
}

/**
 * Endpoints where a 401 is the answer rather than an expired token.
 *
 * Signing in with the wrong password returns 401, and treating that as an expiry would fire a
 * pointless refresh — and for a user who still holds a valid refresh cookie it would succeed,
 * rotating their session as a side effect of mistyping a password, then retry a login that fails
 * identically.
 */
const CREDENTIAL_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

/**
 * A single in-flight refresh, shared by every request that hits a 401 at once.
 *
 * Without this, a page that fires several queries on load would send several refreshes in parallel;
 * because refresh tokens rotate and reuse is treated as theft, the later ones would present a token
 * already consumed and the server would revoke the whole family — logging the user out for being
 * fast. Sharing one promise means exactly one rotation happens.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // send the httpOnly refresh cookie
      });
      if (!res.ok) {
        setAccessToken(null);
        return false;
      }
      const { accessToken } = (await res.json()) as { accessToken: string };
      setAccessToken(accessToken);
      return true;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Performs an API call and returns the parsed body.
 *
 * Every failure becomes an {@link ApiError} carrying the server's problem body, so callers branch on
 * a code rather than inspecting status numbers or message strings. A 401 triggers one silent refresh
 * and one retry; if that fails the session is genuinely over and the error surfaces.
 *
 * @throws ApiError for any non-2xx response.
 */
export async function apiFetch<T>(
  path: string,
  { method = 'GET', body, retryOnUnauthorized = true }: RequestOptions = {},
): Promise<T> {
  const token = getAccessToken();

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // The access token is short-lived by design, so an expiry mid-session is routine rather than
  // exceptional: refresh once, retry once, and only then treat it as a real failure.
  if (res.status === 401 && retryOnUnauthorized && !CREDENTIAL_PATHS.includes(path)) {
    if (await refreshAccessToken()) {
      return apiFetch<T>(path, { method, body, retryOnUnauthorized: false });
    }
  }

  if (!res.ok) {
    throw new ApiError(await readProblem(res));
  }

  // 204 and other empty bodies are legitimate successes (logout, for one).
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/**
 * Reads the problem body, falling back to a synthetic one.
 *
 * A gateway timeout or a crash before the exception filter runs can return HTML or nothing at all, so
 * the parse cannot be assumed to succeed — and a client that throws while handling an error reports
 * the wrong failure.
 */
async function readProblem(res: Response): Promise<ProblemDetails> {
  try {
    const body = (await res.json()) as Partial<ProblemDetails>;
    if (typeof body?.title === 'string' && typeof body?.status === 'number') {
      return body as ProblemDetails;
    }
  } catch {
    // fall through to the synthetic problem below
  }
  return {
    type: 'about:blank',
    title: res.statusText || 'Request failed',
    status: res.status,
    instance: '',
  };
}

/** Restores a session on startup, using the refresh cookie if the browser still holds a valid one. */
export function restoreSession(): Promise<boolean> {
  return refreshAccessToken();
}
