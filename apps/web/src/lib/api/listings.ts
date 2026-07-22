import { apiFetch } from './client';
import type { Listing } from './types';

/**
 * Browses active listings, optionally narrowed to a city.
 *
 * City is the only filter the API applies. Guest capacity is filtered client-side against
 * `maxGuests`, and dates are not filtered at all — there is no availability-search endpoint, and
 * inventing one on the client would mean guessing which dates are free.
 */
export function listListings(city?: string): Promise<Listing[]> {
  const query = city ? `?city=${encodeURIComponent(city)}` : '';
  return apiFetch<Listing[]>(`/listings${query}`);
}

export function getListing(id: string): Promise<Listing> {
  return apiFetch<Listing>(`/listings/${id}`);
}

export function listMyListings(): Promise<Listing[]> {
  return apiFetch<Listing[]>('/listings/mine');
}

/**
 * Updates one of the caller's own listings.
 *
 * Used for withdrawing a listing from sale — `active: false` hides it from search while leaving its
 * bookings and reviews intact, which is what a host wants for a property they no longer rent.
 */
export function updateListing(
  id: string,
  changes: Partial<Pick<Listing, 'title' | 'city' | 'nightlyPriceCents' | 'maxGuests' | 'active'>>,
): Promise<Listing> {
  return apiFetch<Listing>(`/listings/${id}`, { method: 'PATCH', body: changes });
}

/**
 * Deletes one of the caller's own listings.
 *
 * Succeeds only for a listing nobody has booked. The server refuses one with reservations rather than
 * cascading the delete through them, so a booking a guest paid for cannot disappear because a host
 * tidied up.
 *
 * @throws ApiError `LISTING_HAS_BOOKINGS` when reservations still reference the listing.
 */
export function deleteListing(id: string): Promise<void> {
  return apiFetch<void>(`/listings/${id}`, { method: 'DELETE' });
}

/** Query keys, kept together so a mutation can invalidate exactly what it invalidated. */
export const listingKeys = {
  all: ['listings'] as const,
  browse: (city?: string) => ['listings', 'browse', city ?? ''] as const,
  detail: (id: string) => ['listings', 'detail', id] as const,
  mine: () => ['listings', 'mine'] as const,
};
