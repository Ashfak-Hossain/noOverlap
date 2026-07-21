/**
 * The access token, held in memory only.
 *
 * Deliberately not in `localStorage` or a readable cookie: anything stored there can be read by any
 * script running on the page, so a single injected script — from our code or a dependency — would
 * walk off with a valid credential. A module variable is not reachable that way.
 *
 * The cost is that a page reload loses it. That is affordable because the refresh token lives in an
 * httpOnly cookie the browser sends automatically and JavaScript cannot read, so the app can ask for
 * a new access token silently on startup and after any expiry.
 */
let accessToken: string | null = null;

/** Subscribers notified whenever the session appears or disappears, so the UI can react. */
const listeners = new Set<(token: string | null) => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function onAccessTokenChange(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
