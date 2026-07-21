import { apiFetch } from './client';
import { setAccessToken } from './token';
import type { AuthUser, LoginResponse, Role } from './types';

/** Signs in and installs the access token for subsequent requests. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setAccessToken(res.accessToken);
  return res;
}

/**
 * Creates an account and signs straight into it.
 *
 * Registration returns the new user rather than a token, so the sign-in follows here instead of
 * making someone type the same credentials twice to reach the page they were already heading for.
 */
export async function register(email: string, password: string, role: Role): Promise<void> {
  await apiFetch('/auth/register', {
    method: 'POST',
    body: { email, password, role },
  });
  await login(email, password);
}

/**
 * Ends the session.
 *
 * The server call revokes the refresh token — without it the httpOnly cookie would still mint new
 * access tokens, so clearing only the in-memory one would log the user out until the next reload.
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    // Local state is cleared even if the call fails: the user asked to be signed out.
    setAccessToken(null);
  }
}

export function fetchMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me');
}
