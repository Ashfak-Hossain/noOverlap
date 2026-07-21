import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/problem';

/**
 * The shared cache for all server state.
 *
 * Two defaults are deliberate. Failed requests retry, but never the ones where retrying cannot help:
 * a 404, a validation failure, or a lost slot are answers, not outages, and repeating them only
 * delays showing the user what happened. And data is treated as fresh briefly, so moving between
 * pages reads the cache instead of refetching what was just loaded.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // A write is never retried automatically: the caller decides, because repeating a booking
      // attempt is a business decision rather than a transport one.
      retry: false,
    },
  },
});
