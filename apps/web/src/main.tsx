import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import './index.css';
import { restoreSession } from './lib/api/client';
import { queryClient } from './lib/query-client';
import { router } from './router';

/*
 * The access token is held in memory, so a reload starts with no session even when the user is still
 * signed in. Attempting a refresh before the first render — using the httpOnly cookie the browser
 * still holds — means an authenticated user does not see a flash of the signed-out UI.
 *
 * The outcome is deliberately not branched on: failure just means no session, which is a valid
 * starting state, and the app has to render either way.
 */
void restoreSession().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
