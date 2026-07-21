import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../../lib/use-session';

/**
 * Keeps a route behind a session.
 *
 * This is a convenience, never a security boundary — the API authorises every request on its own, and
 * a determined user can render any component they like. Its job is to avoid showing someone a door
 * that will not open, and to send them back where they were going once it does.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useSession();
  const location = useLocation();

  // A session restored from the refresh cookie is still resolving on a cold load; redirecting now
  // would bounce a signed-in user to the sign-in page for the sake of a few hundred milliseconds.
  if (isLoading) {
    return <div className="py-24 text-center text-sm text-ink-muted">Checking your session…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
