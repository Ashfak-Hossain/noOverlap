/**
 * The API's response shapes, as the client consumes them.
 *
 * Money is integer cents everywhere, matching the server: it is formatted at the point of display and
 * never used in arithmetic as a float. Timestamps are ISO 8601 strings.
 */

export type Role = 'GUEST' | 'HOST';

/**
 * Where a reservation is in its lifecycle.
 *
 * `HELD` is the one that shapes the UI: the slot is claimed but payment is still in flight, so the
 * booking is real but not yet settled, and it will change on its own within seconds.
 */
export type ReservationStatus = 'HELD' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';

/** Statuses that will not change again, so a view of one can stop polling. */
export const TERMINAL_STATUSES: readonly ReservationStatus[] = [
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
];

export function isSettled(status: ReservationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface Listing {
  id: string;
  hostId: string;
  title: string;
  city: string;
  nightlyPriceCents: number;
  maxGuests: number;
  active: boolean;
  createdAt: string;
}

export interface Reservation {
  id: string;
  listingId: string;
  guestId: string;
  checkIn: string;
  checkOut: string;
  status: ReservationStatus;
  priceTotalCents: number;
  /** When an unpaid hold is reclaimed — drives the countdown shown while the booking is pending. */
  holdExpiresAt: string;
  createdAt: string;
}

export interface Review {
  id: string;
  reservationId: string;
  listingId: string;
  rating: number;
  body: string | null;
  createdAt: string;
}

export interface ListingReviews {
  /**
   * Null when nobody has reviewed the listing.
   *
   * Not zero, which is a rating a listing can genuinely earn — the server distinguishes the two and
   * the client has to keep that distinction rather than collapsing it with `?? 0`.
   */
  averageRating: number | null;
  count: number;
  reviews: Review[];
}

/**
 * The caller's identity as the API reports it.
 *
 * Only what the access token carries — notably no email, since the token holds none and inventing a
 * field the server never sends would mean rendering `undefined` at a guest.
 */
export interface AuthUser {
  userId: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
}
