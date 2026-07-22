import { apiFetch } from './client';
import type { ListingReviews, Review } from './types';

export interface CreateReviewInput {
  reservationId: string;
  rating: number;
  body?: string;
}

/**
 * Records a review of a stay.
 *
 * The reservation identifies it, not the listing: it is the evidence the stay happened, and the server
 * refuses anything that is not the caller's own completed booking.
 *
 * @throws ApiError `NOT_FOUND` when the reservation is not the caller's — the same answer as one that
 * does not exist.
 * @throws ApiError `REVIEW_STAY_NOT_FINISHED` when the stay has not ended yet.
 * @throws ApiError `REVIEW_ALREADY_EXISTS` when it has already been reviewed.
 */
export function createReview(input: CreateReviewInput): Promise<Review> {
  return apiFetch<Review>('/reviews', { method: 'POST', body: input });
}

/** A listing's reviews and its average rating. Public — no session required. */
export function getListingReviews(listingId: string): Promise<ListingReviews> {
  return apiFetch<ListingReviews>(`/listings/${listingId}/reviews`);
}

/** Query keys, kept together so a mutation can invalidate exactly what it invalidated. */
export const reviewKeys = {
  all: ['reviews'] as const,
  forListing: (listingId: string) => ['reviews', 'listing', listingId] as const,
};
