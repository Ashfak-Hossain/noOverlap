import { apiFetch } from './client';
import type { Reservation } from './types';

export interface CreateHoldInput {
  listingId: string;
  /** `yyyy-MM-dd`. Sent as calendar dates so no timezone conversion can shift the stay. */
  checkIn: string;
  checkOut: string;
}

/**
 * Places a hold on a date range.
 *
 * Returns a `HELD` reservation, never a confirmed one: payment settles afterwards, in another
 * process. A range already taken fails with `RESERVATION_SLOT_TAKEN` — an outcome to render, not an
 * error to report.
 *
 * @throws ApiError `RESERVATION_SLOT_TAKEN` when another guest won the slot first.
 */
export function createHold(input: CreateHoldInput): Promise<Reservation> {
  return apiFetch<Reservation>('/reservations', {
    method: 'POST',
    body: input,
  });
}

/**
 * Reads one reservation.
 *
 * Scoped to the caller: another guest's id is answered with a 404 rather than a 403, so an id cannot
 * be probed to learn whether it exists.
 */
export function getReservation(id: string): Promise<Reservation> {
  return apiFetch<Reservation>(`/reservations/${id}`);
}

export function listMyReservations(): Promise<Reservation[]> {
  return apiFetch<Reservation[]>('/reservations/mine');
}

/**
 * Reservations made against the caller's own listings — the host's side of the book.
 *
 * Host-only, and scoped by ownership on the server, so it can only ever return bookings for
 * properties the caller published.
 */
export function listReceivedReservations(): Promise<Reservation[]> {
  return apiFetch<Reservation[]>('/reservations/received');
}

/**
 * Cancels a reservation, releasing its dates.
 *
 * The slot reopens immediately, because a cancelled reservation stops counting against the listing.
 * Cancelling one that was already paid for also sets a refund in motion — that happens server-side,
 * asynchronously, so the returned reservation reflects the cancellation while the money is still on
 * its way back.
 *
 * @throws ApiError `INVALID_STATE_TRANSITION` when the reservation has already reached a state it
 * cannot be cancelled from.
 */
export function cancelReservation(id: string): Promise<Reservation> {
  return apiFetch<Reservation>(`/reservations/${id}/cancel`, { method: 'POST' });
}

/** Query keys, kept together so a mutation can invalidate exactly what it invalidated. */
export const reservationKeys = {
  all: ['reservations'] as const,
  mine: () => ['reservations', 'mine'] as const,
  received: () => ['reservations', 'received'] as const,
  detail: (id: string) => ['reservations', 'detail', id] as const,
};
