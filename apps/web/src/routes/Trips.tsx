import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { Card, EmptyState, Skeleton } from '../components/primitives';
import { StatusPill } from '../components/StatusPill';
import { getListing, listingKeys } from '../lib/api/listings';
import { cancelReservation, listMyReservations, reservationKeys } from '../lib/api/reservations';
import { isSettled, type Listing, type Reservation } from '../lib/api/types';
import { formatDate, formatMoney, nightsBetween } from '../lib/format';
import { ReviewForm } from '../features/reviews/ReviewForm';
import { useListingUpdates } from '../lib/realtime/use-listing-updates';

/** How often the list re-reads itself while any trip is still settling. */
const POLL_MS = 2000;

function TripRow({
  reservation,
  listing,
  past,
  onCancel,
  cancelling,
}: {
  reservation: Reservation;
  listing: Listing | undefined;
  past: boolean;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const [reviewing, setReviewing] = useState(false);
  const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
  // A reservation only reaches CONFIRMED by way of a successful charge, so payment state is knowable
  // there. It is not for a cancelled one — that may have been a decline or a refund, and the API does
  // not distinguish them on this shape — so no payment pill is shown rather than a guessed one.
  const paid = reservation.status === 'CONFIRMED';
  const canCancel = !past && (reservation.status === 'HELD' || reservation.status === 'CONFIRMED');
  // Offered on exactly the status the server accepts. A stay whose dates have passed but which the
  // completion sweep has not reached yet is still CONFIRMED, and offering a button that can only be
  // refused would be worse than waiting for it to become true.
  const canReview = reservation.status === 'COMPLETED';

  return (
    <Card className={['flex flex-wrap items-center gap-4 p-4', past ? 'opacity-90' : ''].join(' ')}>
      <Link
        to={`/listings/${reservation.listingId}`}
        aria-label={listing ? `View ${listing.title}` : 'View listing'}
        className="size-19.5 shrink-0 rounded-[13px] bg-surface-2"
        style={{
          backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, var(--${past ? 'text-faint' : 'accent'}) 11%, transparent) 0 2px, transparent 2px 12px)`,
        }}
      />
      <div className="min-w-0 flex-1 basis-55">
        <p className="text-base font-bold">{listing?.title ?? 'Your stay'}</p>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          {listing?.city ? `${listing.city} · ` : ''}
          {formatDate(reservation.checkIn)} – {formatDate(reservation.checkOut)}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-faint">
          <span className="font-mono">{reservation.id.slice(0, 8).toUpperCase()}</span> · {nights}{' '}
          {nights === 1 ? 'night' : 'nights'} ·{' '}
          <span className="font-semibold text-ink tabular-nums">
            {formatMoney(reservation.priceTotalCents)}
          </span>
        </p>
      </div>
      <div className="flex flex-col items-end gap-2.5">
        <div className="flex flex-wrap justify-end gap-1.5">
          <StatusPill
            status={reservation.status.toLowerCase() as Lowercase<Reservation['status']>}
            size="sm"
          />
          {paid && <StatusPill status="paid" size="sm" />}
        </div>
        {canCancel && (
          <Button
            variant="secondary"
            size="sm"
            loading={cancelling}
            onClick={() => onCancel(reservation.id)}
          >
            Cancel
          </Button>
        )}
        {canReview && !reviewing && (
          <Button variant="secondary" size="sm" onClick={() => setReviewing(true)}>
            Leave a review
          </Button>
        )}
      </div>

      {reviewing && (
        <div className="w-full">
          <ReviewForm
            reservationId={reservation.id}
            listingId={reservation.listingId}
            onDone={() => setReviewing(false)}
          />
        </div>
      )}
    </Card>
  );
}

export function Component() {
  const queryClient = useQueryClient();

  /**
   * The caller's reservations, re-read while any of them is still settling.
   *
   * A held trip confirms itself from another process, so the list has to notice that happening
   * without the guest doing anything — and stop looking once nothing is in flight.
   */
  const { data: reservations, isPending } = useQuery({
    queryKey: reservationKeys.mine(),
    queryFn: listMyReservations,
    refetchInterval: (query) =>
      query.state.data?.some((r) => !isSettled(r.status)) ? POLL_MS : false,
  });

  // Reservations carry only a listing id, so the listings they refer to are fetched alongside. Each
  // is its own cached query, which means a listing shared by several trips is fetched once.
  const listingIds = [...new Set((reservations ?? []).map((r) => r.listingId))];
  const listingQueries = useQueries({
    queries: listingIds.map((id) => ({
      queryKey: listingKeys.detail(id),
      queryFn: () => getListing(id),
      staleTime: 5 * 60_000,
    })),
  });
  const listings = new Map<string, Listing>(
    listingQueries.flatMap((q) => (q.data ? [[q.data.id, q.data]] : [])),
  );

  /**
   * Live updates for every listing the guest has a trip on.
   *
   * A trip settles in another process, so this list has to learn about it without being asked. The
   * poll above still covers it — realtime here removes the wait, it does not replace the guarantee.
   */
  useListingUpdates(listingIds, () => {
    void queryClient.invalidateQueries({ queryKey: reservationKeys.mine() });
  });

  const cancel = useMutation({
    mutationFn: cancelReservation,
    onSuccess: () =>
      // The cancelled trip changes status and its slot reopens, so both this list and any cached
      // view of that reservation are now stale.
      queryClient.invalidateQueries({ queryKey: reservationKeys.all }),
  });

  // Read once on mount rather than on every render: calling the clock during render is impure, and a
  // trip crossing from upcoming to past mid-session is not a distinction worth re-rendering for.
  const [now] = useState(() => Date.now());
  const all = reservations ?? [];
  // A stay is past once its checkout has gone by — the status alone cannot say, since a confirmed
  // booking stays upcoming right until the day it ends.
  const upcoming = all.filter((r) => new Date(r.checkOut).getTime() >= now);
  const past = all.filter((r) => new Date(r.checkOut).getTime() < now);

  return (
    <section className="animate-rise pt-11 pb-18">
      <h1 className="text-[clamp(26px,3.4vw,34px)] font-extrabold tracking-tight">Your trips</h1>
      <p className="mt-2 mb-7.5 text-[15px] text-ink-muted">
        Every reservation and its live status. A held trip confirms itself once payment settles.
      </p>

      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          title="No trips yet"
          description="When you reserve a stay it will appear here, with its status updating as payment settles."
          action={
            <Link to="/">
              <Button>Find somewhere to stay</Button>
            </Link>
          }
        />
      ) : (
        <>
          <h2 className="mb-3.5 text-sm font-bold tracking-[0.02em] text-ink-faint uppercase">
            Upcoming
          </h2>
          {upcoming.length > 0 ? (
            <div className="mb-10 flex flex-col gap-3">
              {upcoming.map((r) => (
                <TripRow
                  key={r.id}
                  reservation={r}
                  listing={listings.get(r.listingId)}
                  past={false}
                  onCancel={(id) => cancel.mutate(id)}
                  cancelling={cancel.isPending && cancel.variables === r.id}
                />
              ))}
            </div>
          ) : (
            <p className="mb-10 text-sm text-ink-muted">Nothing coming up.</p>
          )}

          {past.length > 0 && (
            <>
              <h2 className="mb-3.5 text-sm font-bold tracking-[0.02em] text-ink-faint uppercase">
                Past
              </h2>
              <div className="flex flex-col gap-3">
                {past.map((r) => (
                  <TripRow
                    key={r.id}
                    reservation={r}
                    listing={listings.get(r.listingId)}
                    past
                    onCancel={(id) => cancel.mutate(id)}
                    cancelling={false}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
