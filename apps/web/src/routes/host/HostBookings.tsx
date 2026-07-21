import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { Card, EmptyState, Skeleton } from '../../components/primitives';
import { StatusPill } from '../../components/StatusPill';
import { getListing, listingKeys } from '../../lib/api/listings';
import {
  listReceivedReservations,
  reservationKeys,
} from '../../lib/api/reservations';
import { isSettled, type Listing, type Reservation } from '../../lib/api/types';
import { formatDate, formatMoney, nightsBetween } from '../../lib/format';

/** How often the board re-reads itself while any booking is still settling. */
const POLL_MS = 2000;

function BookingRow({ reservation }: { reservation: Reservation }) {
  const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-3.5 first:border-t-0">
      <div className="min-w-0 flex-1 basis-50">
        <p className="text-sm font-semibold">
          {formatDate(reservation.checkIn)} –{' '}
          {formatDate(reservation.checkOut)}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-faint">
          <span className="font-mono">
            {reservation.id.slice(0, 8).toUpperCase()}
          </span>{' '}
          · {nights} {nights === 1 ? 'night' : 'nights'}
        </p>
      </div>
      <span className="text-sm font-bold tabular-nums">
        {formatMoney(reservation.priceTotalCents)}
      </span>
      <StatusPill
        status={
          reservation.status.toLowerCase() as Lowercase<Reservation['status']>
        }
        size="sm"
      />
    </div>
  );
}

export function Component() {
  /**
   * Bookings across every listing the host owns, re-read while any is still settling.
   *
   * A booking arrives here without the host doing anything — a guest reserves, payment settles in
   * another process — so the board watches for that and stops once nothing is in flight.
   */
  const { data: reservations, isPending } = useQuery({
    queryKey: reservationKeys.received(),
    queryFn: listReceivedReservations,
    refetchInterval: (query) =>
      query.state.data?.some((r) => !isSettled(r.status)) ? POLL_MS : false,
  });

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

  // Grouped by property, because a host reads this board one listing at a time — "what is happening
  // with the loft?" — rather than as a flat chronological feed.
  const grouped = listingIds.map((id) => ({
    listing: listings.get(id),
    listingId: id,
    bookings: (reservations ?? []).filter((r) => r.listingId === id),
  }));

  return (
    <section className="animate-rise pt-11 pb-18">
      <h1 className="text-[clamp(26px,3.4vw,34px)] font-extrabold tracking-tight">
        Bookings received
      </h1>
      <p className="mt-2 mb-7.5 text-[15px] text-ink-muted">
        Every reservation guests have made on your listings, grouped by
        property.
      </p>

      {isPending ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          description="When a guest reserves one of your listings it appears here, and updates itself as their payment settles."
          action={
            <Link to="/host/listings">
              <Button variant="secondary">Manage your listings</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map((group) => (
            <Card key={group.listingId}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3.5">
                <h2 className="text-[17px] font-bold">
                  {group.listing?.title ?? 'Listing'}
                </h2>
                <span className="text-[13px] text-ink-muted">
                  {group.listing?.city}
                  {group.listing ? ' · ' : ''}
                  {group.bookings.length}{' '}
                  {group.bookings.length === 1 ? 'booking' : 'bookings'}
                </span>
              </div>
              <div className="border-t border-line">
                {group.bookings.map((r) => (
                  <BookingRow key={r.id} reservation={r} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
