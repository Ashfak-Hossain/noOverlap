import { useEffect, useRef } from 'react';
import {
  RESERVATION_CHANGED,
  isReservationChanged,
  type ReservationChanged,
} from '@no-overlap/contracts/realtime';
import { getSocket } from './socket';

/**
 * Why the caller is being told to re-read.
 *
 * `change` is an ordinary update. The other two mean the client knows only that it fell behind, and
 * has no event describing what it missed — which is why the answer to all three is the same: go and
 * re-read. The distinction exists so the interface can say something honest about the second and
 * third, not so the data handling differs.
 */
export type UpdateReason = 'change' | 'gap' | 'reconnect';

export interface ListingUpdate {
  /** The change that arrived, or null when all the client knows is that it missed something. */
  event: ReservationChanged | null;
  reason: UpdateReason;
}

/**
 * Watches listings for reservation changes and reports when the caller's data may be stale.
 *
 * The events are notifications, never data. A pushed message is not trusted as the new truth — it is
 * a prompt to re-read from the API, which is what keeps a lost or duplicated message from producing a
 * wrong screen instead of merely a late one. That is also what makes best-effort delivery acceptable:
 * losing one costs a refresh, not a booking.
 *
 * Each event carries a number that increases per listing, so a client receiving 9 after 7 knows one
 * never arrived. Detecting that is the whole reason the sequence exists — without it a dropped message
 * is silent, and silence is indistinguishable from nothing having happened.
 *
 * @param listingIds the listings to watch; changing the set re-subscribes.
 * @param onUpdate called when the caller should re-read. Its latest version is always used, so it
 * does not need to be memoised.
 */
export function useListingUpdates(
  listingIds: string[],
  onUpdate: (update: ListingUpdate) => void,
): void {
  // Held in a ref so a caller passing an inline arrow does not tear down and rebuild the subscription
  // on every render — which would drop events in the gap between the two. Assigned in an effect
  // rather than during render: a render can be discarded, and a ref written by one that was would
  // leave the subscription calling a version of the callback that never committed.
  const handler = useRef(onUpdate);
  useEffect(() => {
    handler.current = onUpdate;
  });

  // Joined as a sorted string so a caller building the array inline does not resubscribe every render
  // purely because the array identity changed.
  const key = [...listingIds].sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) return;

    const socket = getSocket();
    const lastSeq = new Map<string, number>();

    const join = () => {
      for (const id of ids) socket.emit('watch', id);
    };

    const onChanged = (raw: unknown) => {
      // Checked against the shared contract rather than trusted. This arrives over a socket from
      // outside the app; a malformed message should be ignored, not rendered.
      if (!isReservationChanged(raw)) return;
      const event = raw;
      if (!ids.includes(event.listingId)) return;

      const previous = lastSeq.get(event.listingId);
      // A number we have already seen means a duplicate or an out-of-order delivery. Neither adds
      // anything: the state it describes has already been re-read.
      if (previous !== undefined && event.seq <= previous) return;

      const missed = previous !== undefined && event.seq > previous + 1;
      lastSeq.set(event.listingId, event.seq);
      handler.current({ event, reason: missed ? 'gap' : 'change' });
    };

    /**
     * Rooms do not survive a reconnect: the server-side socket that held them is gone, and the new one
     * has joined nothing. Rejoining here is what stops a reconnected client from sitting in a
     * connection that will never deliver anything again.
     *
     * Anything that happened while the connection was down was missed outright — no sequence gap can
     * reveal it, because none of those events reached us — so a reconnect always means re-read.
     */
    const onConnect = () => {
      join();
      handler.current({ event: null, reason: 'reconnect' });
    };

    if (socket.connected) join();
    socket.on('connect', onConnect);
    socket.on(RESERVATION_CHANGED, onChanged);

    return () => {
      socket.off('connect', onConnect);
      socket.off(RESERVATION_CHANGED, onChanged);
      // Leaving matters on a shared socket: without it, a screen that has closed keeps its rooms and
      // the connection accumulates every listing the session ever visited.
      for (const id of ids) socket.emit('unwatch', id);
    };
  }, [key]);
}
