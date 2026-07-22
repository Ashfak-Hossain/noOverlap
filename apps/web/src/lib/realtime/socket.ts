import { io, type Socket } from 'socket.io-client';

/**
 * The single socket the whole app shares.
 *
 * One connection, not one per screen: a socket is a real resource on both ends, and two screens
 * watching the same listing would otherwise open two of them and receive everything twice. Rooms are
 * what scope delivery, so sharing the connection costs nothing in what each screen sees.
 *
 * Created lazily, on the first screen that actually wants updates. Opening it at startup would connect
 * for visitors who never reach a listing.
 */

/** How the connection is doing, as far as the interface needs to say. */
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

let socket: Socket | null = null;
let state: ConnectionState = 'connecting';
const listeners = new Set<() => void>();

function setState(next: ConnectionState): void {
  if (next === state) return;
  state = next;
  for (const notify of listeners) notify();
}

/**
 * The shared socket, connecting it on first use.
 *
 * Reconnection is left to Socket.IO, which already backs off between attempts. What this adds is
 * telling the rest of the app what is happening, because a silent reconnect is indistinguishable from
 * a working connection that has nothing to say — and those two need different behaviour when it comes
 * back.
 */
export function getSocket(): Socket {
  if (socket) return socket;

  // Same origin: the dev server proxies the websocket to the API, so no cross-origin arrangement is
  // needed and the browser sends cookies as it would for any other request here.
  socket = io('/realtime', {
    // The default transport list starts with polling and upgrades. Going straight to the websocket
    // avoids that round trip, and this app has no environment where polling is the only option.
    transports: ['websocket'],
  });

  socket.on('connect', () => setState('connected'));
  socket.on('disconnect', () => setState('reconnecting'));
  // Socket.IO keeps retrying after this, so it is not terminal — but it is the point where the user
  // should be told, rather than left watching data that has quietly stopped updating.
  socket.io.on('reconnect_attempt', () => setState('reconnecting'));
  socket.io.on('error', () => setState('offline'));

  return socket;
}

/** Subscribes to connection-state changes, in the shape `useSyncExternalStore` expects. */
export function subscribeToConnection(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getConnectionState(): ConnectionState {
  return state;
}
