import { createBrowserRouter } from 'react-router';
import { RequireAuth } from './features/auth/RequireAuth';
import { RootLayout } from './routes/RootLayout';

/** Wraps a lazily-loaded route so it renders only for a signed-in user. */
function guarded(load: () => Promise<{ Component: React.ComponentType }>) {
  return async () => {
    const { Component } = await load();
    return {
      Component: () => (
        <RequireAuth>
          <Component />
        </RequireAuth>
      ),
    };
  };
}

/**
 * The route table.
 *
 * Search criteria (city, dates, guests) live in the URL as query parameters rather than in component
 * state, so a set of results can be shared, bookmarked, and survives both a refresh and the back
 * button.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      { index: true, lazy: () => import('./routes/Search') },
      { path: 'listings/:id', lazy: () => import('./routes/ListingDetail') },
      { path: 'signin', lazy: () => import('./routes/SignIn') },
      { path: 'signup', lazy: () => import('./routes/SignUp') },

      // Everything below needs a session: they are all scoped to the caller.
      {
        path: 'listings/:id/reserve',
        lazy: guarded(() => import('./routes/Reserve')),
      },
      { path: 'trips', lazy: guarded(() => import('./routes/Trips')) },
      { path: 'trips/:id', lazy: guarded(() => import('./routes/TripDetail')) },
      {
        path: 'host/listings',
        lazy: guarded(() => import('./routes/host/HostListings')),
      },
      {
        path: 'host/bookings',
        lazy: guarded(() => import('./routes/host/HostBookings')),
      },

      { path: '*', lazy: () => import('./routes/NotFound') },
    ],
  },
]);
