/**
 * The realtime contract, kept free of any runtime dependency.
 *
 * Separate from the queue contracts because the browser consumes this one. The main entry point
 * builds Zod schemas at module scope, so importing anything from it constructs all of them and pulls
 * the whole validator into the bundle — several hundred kilobytes to check one small event. Splitting
 * the browser-facing half out keeps that cost on the server, where it is already paid.
 *
 * Both halves stay in step because the schema in the main entry point is declared to produce
 * {@link ReservationChanged}: a change to one that the other does not follow fails the build here
 * rather than silently at a client.
 */

/** Where a reservation is in its lifecycle, mirroring the database enum. */
export type ReservationStatusName =
  | 'HELD'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'COMPLETED';

/**
 * Event name, shared so the emitter and every listener cannot drift apart on a string literal — the
 * kind of mismatch that produces no error anywhere, just a listener that never fires.
 */
export const RESERVATION_CHANGED = 'reservation.changed' as const;

/**
 * A reservation's status changed, so the dates it occupies may have.
 *
 * Pushed to clients watching the listing, and **best-effort**: emitted directly rather than through
 * the outbox, because a notification that can be recovered by re-reading needs no durability
 * guarantee. It carries no booking detail on purpose — a recipient treats it as a prompt to re-read,
 * never as data to trust, which is what stops a lost or duplicated message from producing a wrong
 * screen rather than merely a late one.
 *
 * `seq` increases per listing and is what makes best-effort acceptable: a client receiving 7 after 5
 * knows it missed one. Without it a dropped message is silent, and silence is indistinguishable from
 * nothing having happened.
 */
export interface ReservationChanged {
  type: typeof RESERVATION_CHANGED;
  version: 1;
  listingId: string;
  reservationId: string;
  status: ReservationStatusName;
  seq: number;
}

/** The room every client watching a listing joins, so a change reaches them and nobody else. */
export function listingRoom(listingId: string): string {
  return `listing:${listingId}`;
}

const STATUSES: readonly string[] = [
  'HELD',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
];

/**
 * Structural check for a message arriving off a socket.
 *
 * A browser has no reason to carry a full schema validator for this, but it does have reason not to
 * trust the wire: anything reaching it from outside the app should be rejected rather than rendered.
 * The server validates the richer, versioned contracts with the schemas in the main entry point,
 * where that weight is already being carried.
 */
export function isReservationChanged(
  value: unknown,
): value is ReservationChanged {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === RESERVATION_CHANGED &&
    v.version === 1 &&
    typeof v.listingId === 'string' &&
    typeof v.reservationId === 'string' &&
    typeof v.status === 'string' &&
    STATUSES.includes(v.status) &&
    typeof v.seq === 'number' &&
    Number.isInteger(v.seq)
  );
}
