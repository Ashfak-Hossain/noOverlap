import { Link, NavLink, useNavigate } from 'react-router';
import { useTheme } from '../lib/theme';
import { useSession } from '../lib/use-session';
import type { Role } from '../lib/api/types';
import { Button } from './Button';

/**
 * Navigation, filtered by role.
 *
 * A guest is never shown host tools and vice versa — offering a link that leads to an empty or
 * forbidden page is worse than not offering it.
 */
const NAV: Array<{ to: string; label: string; end: boolean; role?: Role }> = [
  { to: '/', label: 'Explore', end: true },
  { to: '/trips', label: 'Trips', end: false, role: 'GUEST' },
  { to: '/host/listings', label: 'Listings', end: false, role: 'HOST' },
  { to: '/host/bookings', label: 'Bookings', end: false, role: 'HOST' },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={dark}
      title="Toggle theme"
      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition-colors hover:text-ink"
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {dark ? (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4" />
          </>
        )}
      </svg>
    </button>
  );
}

/** The application chrome: identity, navigation, theme, and the session entry point. */
export function AppHeader() {
  const { user, isAuthenticated, signOut } = useSession();
  const navigate = useNavigate();
  const visibleNav = NAV.filter((item) => !item.role || item.role === user?.role);

  async function handleSignOut() {
    await signOut();
    void navigate('/', { replace: true });
  }

  return (
    <header className="sticky top-0 z-60 border-b border-line bg-canvas/80 backdrop-blur-[14px]">
      <div className="mx-auto flex h-16.5 max-w-295 items-center gap-5 px-5.5">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex gap-0.75" aria-hidden="true">
            <span className="h-5.5 w-3.25 rounded-[5px] bg-accent" />
            <span className="h-5.5 w-3.25 rounded-[5px] bg-accent2" />
          </span>
          <span className="text-[19px] font-extrabold tracking-[-0.02em]">
            <span className="font-semibold text-ink-muted">no</span>Overlap
          </span>
        </Link>

        <nav className="ml-1.5 hidden items-center gap-1 md:flex">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors',
                  isActive ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />
        <ThemeToggle />
        {isAuthenticated ? (
          <div className="flex items-center gap-2.5">
            <span className="hidden text-[13px] font-semibold text-ink-muted sm:inline">
              {user?.role === 'HOST' ? 'Hosting' : 'Guest'}
            </span>
            <Button variant="secondary" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <Link
            to="/signin"
            className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:border-line-strong"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
