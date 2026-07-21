import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { login, register } from '../../lib/api/auth';
import { ApiError } from '../../lib/api/problem';
import type { Role } from '../../lib/api/types';

function Assurance({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-6.5 items-center justify-center rounded-lg bg-confirmed-soft text-confirmed"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 12.5l4.6 4.6L19.5 7" />
        </svg>
      </span>
      <span className="text-sm text-ink-muted">{children}</span>
    </div>
  );
}

function RoleChoice({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  const options: Array<{ role: Role; title: string; blurb: string }> = [
    { role: 'GUEST', title: 'Guest', blurb: 'Book places to stay' },
    { role: 'HOST', title: 'Host', blurb: 'List and manage stays' },
  ];
  return (
    <fieldset className="mb-5">
      <legend className="mb-2.5 text-[12.5px] font-bold text-ink-muted">
        I&rsquo;m joining as
      </legend>
      <div className="grid grid-cols-2 gap-2.5">
        {options.map((o) => (
          <button
            key={o.role}
            type="button"
            onClick={() => onChange(o.role)}
            aria-pressed={value === o.role}
            className={[
              'flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors',
              value === o.role
                ? 'border-accent bg-accent-soft'
                : 'border-line bg-surface hover:border-line-strong',
            ].join(' ')}
          >
            <span className="text-[14.5px] font-bold">{o.title}</span>
            <span className="text-xs text-ink-muted">{o.blurb}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Sign in and sign up, sharing one card.
 *
 * They are two routes rather than one with local state, so the browser's back button and a direct
 * link both behave as a user expects.
 */
export function AuthScreen({ mode }: { mode: 'signin' | 'signup' }) {
  const isSignup = mode === 'signup';
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('GUEST');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /** Where the user was heading before being sent to sign in. */
  const next = (location.state as { from?: string } | null)?.from ?? '/';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (isSignup) await register(email, password, role);
      else await login(email, password);
      void navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        // Validation failures carry per-field detail; render it against the input that caused it
        // rather than flattening everything into one banner the user has to map back themselves.
        setFieldErrors(err.fieldErrors);
        if (Object.keys(err.fieldErrors).length === 0) setFormError(err.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="animate-rise py-11">
      <div className="mx-auto grid max-w-235 items-center gap-11 md:grid-cols-2">
        <div className="p-2">
          <div className="flex gap-1" aria-hidden="true">
            <span className="h-7 w-4 rounded-md bg-accent" />
            <span className="h-7 w-4 rounded-md bg-accent2" />
          </div>
          <h1 className="mt-5.5 text-[clamp(26px,3vw,34px)] leading-[1.1] font-extrabold tracking-tight text-balance">
            Book with the confidence that your dates are truly yours.
          </h1>
          <p className="mt-4 max-w-[42ch] text-[15.5px] leading-relaxed text-ink-muted">
            One account books stays and hosts them. The slot you reserve can&rsquo;t be taken out
            from under you &mdash; that&rsquo;s the whole point.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Assurance>Dates held instantly, charged only when confirmed</Assurance>
            <Assurance>Refunds tracked from pending to returned</Assurance>
          </div>
        </div>

        <div className="rounded-[22px] border border-line bg-surface p-7 shadow-lg">
          <div className="mb-5.5 flex gap-1 rounded-[13px] border border-line bg-surface-2 p-1">
            {(
              [
                { to: '/signup', label: 'Sign up', active: isSignup },
                { to: '/signin', label: 'Sign in', active: !isSignup },
              ] as const
            ).map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                replace
                className={[
                  'flex-1 rounded-[10px] py-2 text-center text-sm font-bold transition-colors',
                  tab.active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          <h2 className="mb-5 text-[21px] font-bold tracking-[-0.01em]">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h2>

          <form onSubmit={onSubmit} noValidate>
            {isSignup && <RoleChoice value={role} onChange={setRole} />}

            <div className="flex flex-col gap-4">
              <Field
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldErrors.email}
                required
              />
              <Field
                label="Password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                hint={isSignup ? 'At least 12 characters — a passphrase works nicely.' : undefined}
                required
              />
            </div>

            {formError && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-expired/30 bg-expired-soft px-3.5 py-2.5 text-sm font-medium text-expired"
              >
                {formError}
              </p>
            )}

            <Button type="submit" size="lg" loading={submitting} className="mt-5.5 w-full">
              {isSignup ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-4 text-center text-[13px] text-ink-faint">
            By continuing you agree to the booking terms and the 15-minute hold policy.
          </p>
        </div>
      </div>
    </section>
  );
}
