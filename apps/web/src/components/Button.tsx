import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent border-transparent hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface text-ink border-line hover:border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-muted border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-expired-soft text-expired border-expired/30 hover:border-expired/50',
};

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-lg gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-[52px] px-7 text-[15px] rounded-xl gap-2',
};

/**
 * The standard action.
 *
 * `loading` keeps the button mounted and sized while showing a spinner, so a click does not make the
 * layout jump, and disables it — a pending action must not be submitted twice, which matters here
 * because the action behind it is often a booking.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center border font-semibold',
        'transition-colors duration-150',
        // Disabled is dimmed *and* loses its pointer, so the state does not rest on colour alone.
        'disabled:opacity-55 disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      ].join(' ')}
    >
      {loading && (
        <svg className="size-4 shrink-0 animate-spin-slow" viewBox="0 0 24 24" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="42 14"
            opacity="0.9"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
