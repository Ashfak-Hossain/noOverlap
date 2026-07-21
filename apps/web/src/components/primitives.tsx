import type { ReactNode } from 'react';

/** A raised surface — the standard container for a listing, a trip, or a panel. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={['rounded-2xl border border-line bg-surface shadow-sm', className].join(' ')}>
      {children}
    </div>
  );
}

/**
 * A placeholder shaped like the content it is standing in for.
 *
 * Preferred over a spinner wherever the layout is known in advance: it communicates what is coming
 * and stops the page reflowing when the data lands.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={[
        'animate-shimmer rounded-lg bg-surface-2',
        'bg-[linear-gradient(90deg,transparent,var(--surface-3),transparent)] bg-size-[450px_100%]',
        className,
      ].join(' ')}
    />
  );
}

/**
 * What a list shows when it has nothing in it.
 *
 * An empty list is a normal state, not a failure, so it explains the situation and offers the action
 * that would resolve it rather than leaving a blank region the user has to interpret.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface-2/50 px-6 py-14 text-center">
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}
