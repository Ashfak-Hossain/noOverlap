import { useSyncExternalStore } from 'react';
import {
  getConnectionState,
  subscribeToConnection,
  type ConnectionState,
} from '../../lib/realtime/socket';

const COPY: Record<Exclude<ConnectionState, 'connected'>, { label: string; tone: string }> = {
  connecting: { label: 'Connecting…', tone: 'text-held bg-held-soft border-held/30' },
  reconnecting: { label: 'Reconnecting…', tone: 'text-held bg-held-soft border-held/30' },
  offline: { label: 'Offline', tone: 'text-expired bg-expired-soft border-expired/30' },
};

/**
 * Whether live updates are actually arriving.
 *
 * Shown only when they are not. A permanent "connected" badge is noise — the healthy case is the one
 * the user assumes — whereas a broken connection has to be visible, because a page that has silently
 * stopped updating looks exactly like a page where nothing is happening. That distinction is the whole
 * reason this exists.
 *
 * `useSyncExternalStore` rather than an effect and local state: the socket's status lives outside
 * React, and this is the subscription that keeps a render from reading a value that has already
 * changed.
 */
export function ConnectionStatus() {
  const state = useSyncExternalStore(subscribeToConnection, getConnectionState);
  if (state === 'connected') return null;

  const { label, tone } = COPY[state];
  return (
    <span
      // Polite, not assertive: losing a connection is worth saying, but not worth interrupting
      // whatever the user is reading.
      role="status"
      aria-live="polite"
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold',
        tone,
      ].join(' ')}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
