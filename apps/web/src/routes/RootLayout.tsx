import { Outlet } from 'react-router';
import { AppHeader } from '../components/AppHeader';

/** The application shell every route renders inside. */
export function RootLayout() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <AppHeader />
      <main className="mx-auto max-w-295 px-5.5">
        <Outlet />
      </main>
    </div>
  );
}
