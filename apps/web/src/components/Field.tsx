import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

/**
 * A labelled input with its error wired up for assistive technology.
 *
 * The label, the error, and the control are tied together by generated ids rather than by placement,
 * so a screen reader announces the field's name and its problem together. `aria-invalid` marks the
 * failure independently of the red border, which colour-blind users may not perceive.
 */
export function Field({
  label,
  error,
  hint,
  className = '',
  ...rest
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
        }
        className={[
          'h-11 rounded-xl border bg-surface px-3.5 text-sm text-ink',
          'placeholder:text-ink-faint transition-colors',
          error ? 'border-expired' : 'border-line hover:border-line-strong',
          'disabled:opacity-55 disabled:cursor-not-allowed',
          className,
        ].join(' ')}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-expired">
          {error}
        </p>
      )}
    </div>
  );
}
