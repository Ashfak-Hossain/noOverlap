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

/** Query keys, kept together so a mutation can invalidate exactly what it invalidated. */
export const listingKeys = {
  all: ['listings'] as const,
  browse: (city?: string) => ['listings', 'browse', city ?? ''] as const,
  detail: (id: string) => ['listings', 'detail', id] as const,
  mine: () => ['listings', 'mine'] as const,
};
