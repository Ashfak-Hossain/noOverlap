import { useEffect, useState } from 'react';

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Time left on a hold, counting down against the server's own deadline.
 *
 * Derived from `holdExpiresAt` on every tick rather than decremented from a starting number, so a
 * backgrounded tab — where timers are throttled — shows the true remaining time when it returns
 * instead of however far a drifting counter happened to get.
 *
 * The ring is decoration; the figure and its label carry the meaning, so nothing is lost when the
 * gradient cannot be seen.
 */
export function HoldCountdown({
  expiresAt,
  totalMs,
}: {
  expiresAt: string;
  /** The full hold window, used only to size the ring's progress. */
  totalMs: number;
}) {
  // Only the clock is state; the remaining time is derived from it during render. Storing the
  // remainder instead would mean re-syncing it whenever the deadline changed, which is a cascading
  // render for a value that was never independent in the first place.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const left = Math.max(0, new Date(expiresAt).getTime() - now);

  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, left / totalMs)) : 0;

  return (
    <div className="relative flex size-42 items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(var(--held) ${fraction * 360}deg, var(--held-soft) 0deg)`,
        }}
      />
      <div className="absolute inset-3.5 rounded-full bg-surface" />
      <div className="relative text-center">
        <p
          // Announced politely so a screen-reader user hears the remaining time without the counter
          // interrupting them every second.
          role="status"
          aria-live="polite"
          className="font-mono text-[34px] font-semibold tracking-[-0.02em] tabular-nums text-held"
        >
          {mmss(left)}
        </p>
        <p className="mt-0.5 text-[11px] font-bold tracking-[0.06em] text-ink-faint uppercase">
          left on hold
        </p>
      </div>
    </div>
  );
}
