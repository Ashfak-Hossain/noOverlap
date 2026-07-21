import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { fetchMe, logout as logoutRequest } from './api/auth';
import { getAccessToken, onAccessTokenChange } from './api/token';
import type { AuthUser } from './api/types';

/**
 * Reads the in-memory access token reactively.
 *
 * The token lives outside React (any request may replace it after a silent refresh), so it is
 * subscribed to as an external store rather than mirrored into state, which would let the two drift.
 */
function useAccessToken(): string | null {
  return useSyncExternalStore(onAccessTokenChange, getAccessToken, () => null);
}

export interface Session {
  user: AuthUser | undefined;
  isAuthenticated: boolean;
  /** True while the identity behind an existing token is still being fetched. */
  isLoading: boolean;
  signOut: () => Promise<void>;
}

/**
 * The current session.
 *
 * Identity is fetched from the server rather than decoded from the token in the browser: a client
 * cannot verify a signature it does not hold the key for, so trusting the token's own claims would
 * be trusting unverified input. The token is only proof to send; the server says who it belongs to.
 */
export function useSession(): Session {
  const token = useAccessToken();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    // Keyed by the token so a different session cannot read the previous one's cached identity.
    queryKey: ['session', token],
    queryFn: fetchMe,
    enabled: token !== null,
    staleTime: Infinity,
  });

  const signOut = useCallback(async () => {
    await logoutRequest();
    // Everything cached was fetched as the previous user; none of it belongs to the next one.
    queryClient.clear();
  }, [queryClient]);

  return {
    user: token ? user : undefined,
    isAuthenticated: Boolean(token && user),
    isLoading: token !== null && isLoading,
    signOut,
  };
}
