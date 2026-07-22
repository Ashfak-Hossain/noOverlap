import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/primitives';
import { StatusPill } from '../components/StatusPill';
import { HoldCountdown } from '../features/booking/HoldCountdown';
import { useSearchCriteria } from '../features/search/search-params';
import { getListing, listingKeys } from '../lib/api/listings';
import { ApiError } from '../lib/api/problem';
import { createHold, getReservation, reservationKeys } from '../lib/api/reservations';
import { isSettled, type Reservation } from '../lib/api/types';
import { formatDate, formatMoney, nightsBetween } from '../lib/format';
import { useListingUpdates } from '../lib/realtime/use-listing-updates';

/**
 * Reserving a stay.
 *
 * The screen exists because booking here is not a single request. Placing a hold claims the dates
 * immediately, but the charge runs afterwards in a separate process, so the outcome arrives seconds
 * later and every way it can land needs somewhere to be shown: confirmed, declined, expired, or lost
 * to a faster guest.
 */

/**
 * How often an unsettled reservation is re-read while payment runs.
 *
 * Fast enough that confirmation feels immediate, slow enough not to hammer the API for the length of
 * a hold. The interval only matters until the reservation settles, at which point polling stops.
 */
const POLL_MS = 1500;

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-rise flex flex-col items-center px-10 py-14 text-center">
      {children}
    </div>
  );
}

function Securing({ dates }: { dates: string }) {
  return (
    <Stage>
      <span
        aria-hidden="true"
        className="animate-spin-slow size-14 rounded-full border-4 border-accent-soft border-t-accent"
      />
      <h2 className="mt-6.5 mb-1.5 text-[22px] font-bold">Securing your dates…</h2>
      <p className="max-w-[36ch] text-ink-muted">
        Placing a hold on {dates}. This only takes a moment.
      </p>
    </Stage>
  );
}

function Held({
  reservation,
  dates,
  holdWindowMs,
}: {
  reservation: Reservation;
  dates: string;
  holdWindowMs: number;
}) {
  return (
    <Stage>
      <HoldCountdown expiresAt={reservation.holdExpiresAt} totalMs={holdWindowMs} />
      <div className="mt-6">
        <StatusPill status="held" />
      </div>
      <h2 className="mt-4 mb-1.5 text-[23px] font-bold tracking-[-0.01em]">Your dates are held</h2>
      <p className="max-w-[42ch] text-ink-muted text-pretty">
        We&rsquo;ve claimed {dates} for you — no one else can take this slot. Payment is settling
        now.
      </p>
      <div className="mt-5.5 flex max-w-[44ch] items-start gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3.5 text-left">
        <span aria-hidden="true" className="mt-px shrink-0 text-accent">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
          </svg>
        </span>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Nothing to do here —{' '}
          <strong className="font-bold text-ink">confirmation arrives automatically</strong> the
          moment your payment clears. There&rsquo;s no confirm button by design.
        </p>
      </div>
    </Stage>
  );
}

function Confirmed({
  reservation,
  title,
  dates,
}: {
  reservation: Reservation;
  title: string;
  dates: string;
}) {
  return (
    <div className="flex flex-col items-center px-10 py-14 text-center">
      <div className="relative flex items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute size-19 rounded-full bg-confirmed"
          style={{ animation: 'omRing 1.1s ease-out 0.1s' }}
        />
        <span
          aria-hidden="true"
          className="animate-pop flex size-19 items-center justify-center rounded-full bg-confirmed-soft text-confirmed"
        >
          <svg
            width="38"
            height="38"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 12.5l4.6 4.6L19.5 7" />
          </svg>
        </span>
      </div>
      <h2 className="mt-6 mb-1.5 text-[26px] font-extrabold tracking-[-0.02em]">
        You&rsquo;re booked!
      </h2>
      <p className="mb-4.5 text-ink-muted">
        {title} · {dates}
      </p>
      <div className="flex gap-2">
        <StatusPill status="confirmed" />
        <StatusPill status="paid" />
      </div>
      <div className="mt-5.5 flex gap-6.5 rounded-2xl border border-line bg-surface-2 px-6.5 py-4">
        <div className="text-left">
          <p className="text-[11px] font-bold tracking-[0.04em] text-ink-faint uppercase">
            Confirmation
          </p>
          {/* Derived from the reservation's own id — a real reference, not a generated code. */}
          <p className="mt-0.5 font-mono text-[15px] font-semibold">
            {reservation.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div className="border-l border-line pl-6.5 text-left">
          <p className="text-[11px] font-bold tracking-[0.04em] text-ink-faint uppercase">
            Total paid
          </p>
          <p className="mt-0.5 text-[15px] font-bold tabular-nums">
            {formatMoney(reservation.priceTotalCents)}
          </p>
        </div>
      </div>
      <div className="mt-6.5 flex gap-2.5">
        <Link to="/trips">
          <Button>View in My trips</Button>
        </Link>
        <Link to="/">
          <Button variant="secondary">Back to explore</Button>
        </Link>
      </div>
    </div>
  );
}

function SlotTaken({ dates, listingId }: { dates: string; listingId: string }) {
  return (
    <Stage>
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-[18px] bg-expired-soft text-expired"
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M6.4 6.4l11.2 11.2" />
        </svg>
      </span>
      <h2 className="mt-5 mb-1.5 text-[23px] font-bold tracking-[-0.01em]">
        Those dates were just taken
      </h2>
      <p className="max-w-[46ch] text-ink-muted text-pretty">
        Someone reserved {dates} a moment before you. Exactly one guest can win a slot — this time
        it wasn&rsquo;t you.{' '}
        <strong className="font-bold text-ink">Your card was not charged.</strong>
      </p>
      <div className="mt-6 flex gap-2.5">
        <Link to={`/listings/${listingId}`}>
          <Button>Pick different dates</Button>
        </Link>
        <Link to="/">
          <Button variant="secondary">Explore other stays</Button>
        </Link>
      </div>
      <p className="mt-4.5 font-mono text-[11px] text-ink-faint">409 · reservation-slot-taken</p>
    </Stage>
  );
}

/**
 * A hold that ended without a booking.
 *
 * Declines and expiries share a panel because they are the same story to a guest — the dates went
 * back on sale and no money moved — and differ only in why. Splitting them into two components would
 * duplicate that reassurance, which is the part that actually matters to the reader.
 */
function Released({
  kind,
  dates,
  listingId,
}: {
  kind: 'failed' | 'expired';
  dates: string;
  listingId: string;
}) {
  const failed = kind === 'failed';
  return (
    <Stage>
      <span
        aria-hidden="true"
        className={[
          'flex size-16 items-center justify-center rounded-[18px]',
          failed ? 'bg-expired-soft text-expired' : 'bg-held-soft text-held',
        ].join(' ')}
      >
        {failed ? (
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l9.5 16.5H2.5L12 3z" />
            <path d="M12 10v4M12 17h.01" />
          </svg>
        ) : (
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3.2 1.9" />
          </svg>
        )}
      </span>
      <div className="mt-4.5">
        <StatusPill status={failed ? 'failed' : 'expired'} />
      </div>
      <h2 className="mt-4 mb-1.5 text-[23px] font-bold tracking-[-0.01em]">
        {failed ? 'Payment couldn’t be completed' : 'Your hold expired'}
      </h2>
      <p className="max-w-[46ch] text-ink-muted text-pretty">
        {failed
          ? `The hold on ${dates} has been released and the dates are back on sale. You weren’t charged — the card was declined.`
          : `The window closed before payment completed, so ${dates} went back on sale. No charge was made.`}
      </p>
      <div className="mt-6 flex gap-2.5">
        <Link to={`/listings/${listingId}`}>
          <Button>Try again</Button>
        </Link>
        <Link to="/">
          <Button variant="secondary">Explore</Button>
        </Link>
      </div>
      <p className="mt-5 font-mono text-[11px] text-ink-faint">
        {failed
          ? 'payment declined · hold compensated → released'
          : 'hold ttl elapsed · swept → expired'}
      </p>
    </Stage>
  );
}

/**
 * Places the hold on arrival and follows it to whatever it becomes.
 *
 * Deliberately not optimistic. A booking can genuinely lose its slot to another guest, so showing a
 * confirmation before the server has given one would mean retracting it — and for a reservation that
 * is worse than waiting a second for the truth.
 *
 * @remarks Requires a session; the route is registered behind the auth guard, and the reserve URL is
 * carried through sign-in so a guest returns here with their dates intact.
 */
export function Component() {
  const { id: listingId = '' } = useParams();
  const [criteria] = useSearchCriteria();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reservationId, setReservationId] = useState<string | null>(null);

  const { data: listing } = useQuery({
    queryKey: listingKeys.detail(listingId),
    queryFn: () => getListing(listingId),
    enabled: Boolean(listingId),
  });

  const hold = useMutation({
    mutationFn: createHold,
    onSuccess: (reservation) => {
      setReservationId(reservation.id);
      // Seed the cache so the poll below starts from the hold we just made rather than refetching it.
      queryClient.setQueryData(reservationKeys.detail(reservation.id), reservation);
    },
  });

  /**
   * Placing the hold happens once, on arrival.
   *
   * The ref guard is load-bearing rather than defensive: React runs effects twice in development, and
   * a second POST would overlap the hold the first one just made — the API would correctly reject it
   * as a taken slot, and the guest would be told they lost a race against themselves.
   */
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current) return;
    if (!listingId || !criteria.checkIn || !criteria.checkOut) return;
    placed.current = true;
    hold.mutate({
      listingId,
      checkIn: criteria.checkIn,
      checkOut: criteria.checkOut,
    });
  }, [listingId, criteria.checkIn, criteria.checkOut, hold]);

  /**
   * Watches the reservation until it settles.
   *
   * Confirmation is produced by another process, so there is nothing to await — the reservation is
   * re-read until it reaches a terminal status, and the polling stops itself the moment it does.
   * A poll with no stopping condition is a tax on the battery and the server for as long as the tab
   * stays open.
   */
  const { data: reservation } = useQuery({
    queryKey: reservationKeys.detail(reservationId ?? ''),
    queryFn: () => getReservation(reservationId!),
    enabled: reservationId !== null,
    refetchInterval: (query) => {
      const current = query.state.data;
      return current && !isSettled(current.status) ? POLL_MS : false;
    },
  });

  /**
   * The fast path to the same answer.
   *
   * The poll above is still what guarantees this screen settles; this only shortens the wait. Realtime
   * delivery is best-effort by design — an event can be lost and nothing will resend it — so treating
   * it as the mechanism rather than an accelerator would leave a guest staring at "held" indefinitely
   * whenever one went missing. Both paths do exactly the same thing: re-read the reservation.
   */
  useListingUpdates(listingId ? [listingId] : [], () => {
    if (!reservationId) return;
    void queryClient.invalidateQueries({
      queryKey: reservationKeys.detail(reservationId),
    });
  });

  // Arriving without dates means the flow was entered out of order; send them back to choose.
  useEffect(() => {
    if (!criteria.checkIn || !criteria.checkOut) {
      void navigate(`/listings/${listingId}`, { replace: true });
    }
  }, [criteria.checkIn, criteria.checkOut, listingId, navigate]);

  const dates =
    criteria.checkIn && criteria.checkOut
      ? `${formatDate(criteria.checkIn)} – ${formatDate(criteria.checkOut)}`
      : '';
  const nights =
    criteria.checkIn && criteria.checkOut ? nightsBetween(criteria.checkIn, criteria.checkOut) : 0;
  // The hold window is measured from the reservation itself rather than assuming the server's TTL.
  // That value is configuration on the API side and can change without the client knowing, and the
  // countdown ring would quietly misrepresent how much time is left if the two ever disagreed.
  const holdWindowMs = reservation
    ? new Date(reservation.holdExpiresAt).getTime() - new Date(reservation.createdAt).getTime()
    : 0;

  const slotTaken =
    hold.isError && hold.error instanceof ApiError && hold.error.code === 'RESERVATION_SLOT_TAKEN';

  return (
    <section className="pt-6.5 pb-18">
      <Link
        to={`/listings/${listingId}`}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
      >
        <span aria-hidden="true">←</span> Back to {listing?.title ?? 'listing'}
      </Link>

      <div className="grid items-start gap-11 lg:grid-cols-[1fr_380px]">
        <div>
          <h1 className="mb-1.5 text-[clamp(24px,3vw,32px)] font-extrabold tracking-tight">
            Confirm and reserve
          </h1>
          <p className="mb-6 text-[15px] text-ink-muted">
            Reserving happens in two steps — we hold your dates, then payment settles on its own.
          </p>

          <Card className="min-h-105 overflow-hidden shadow-md">
            {slotTaken ? (
              <SlotTaken dates={dates} listingId={listingId} />
            ) : hold.isError ? (
              <Stage>
                <h2 className="mb-1.5 text-[23px] font-bold">Couldn&rsquo;t place the hold</h2>
                <p className="max-w-[46ch] text-ink-muted">
                  {hold.error instanceof ApiError
                    ? hold.error.message
                    : 'Something went wrong. Please try again.'}
                </p>
                <Link to={`/listings/${listingId}`} className="mt-6">
                  <Button variant="secondary">Back to listing</Button>
                </Link>
              </Stage>
            ) : !reservation ? (
              <Securing dates={dates} />
            ) : reservation.status === 'HELD' ? (
              <Held reservation={reservation} dates={dates} holdWindowMs={holdWindowMs} />
            ) : reservation.status === 'CONFIRMED' ? (
              <Confirmed
                reservation={reservation}
                title={listing?.title ?? 'Your stay'}
                dates={dates}
              />
            ) : reservation.status === 'EXPIRED' ? (
              <Released kind="expired" dates={dates} listingId={listingId} />
            ) : (
              <Released kind="failed" dates={dates} listingId={listingId} />
            )}
          </Card>
        </div>

        <aside className="lg:sticky lg:top-22">
          <Card className="overflow-hidden">
            <div className="flex gap-3.5 border-b border-line p-4">
              <div
                className="size-16.5 shrink-0 rounded-[13px] bg-surface-2"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, color-mix(in oklab, var(--accent) 10%, transparent) 0 2px, transparent 2px 11px)',
                }}
              />
              <div>
                <p className="text-[15px] leading-tight font-bold">{listing?.title ?? '—'}</p>
                <p className="mt-1 text-[13px] text-ink-muted">{listing?.city ?? ''}</p>
              </div>
            </div>
            <div className="p-4">
              <div className="mb-2.5 flex justify-between text-[13.5px]">
                <span className="text-ink-muted">Dates</span>
                <span className="font-semibold">{dates}</span>
              </div>
              <div className="mb-4 flex justify-between text-[13.5px]">
                <span className="text-ink-muted">Guests</span>
                <span className="font-semibold">{criteria.guests}</span>
              </div>
              {listing && nights > 0 && (
                <div className="flex flex-col gap-2.5 border-t border-line pt-3.5 text-[13.5px]">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">
                      {formatMoney(listing.nightlyPriceCents)} × {nights}{' '}
                      {nights === 1 ? 'night' : 'nights'}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(nights * listing.nightlyPriceCents)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-line pt-3 text-[15px] font-bold">
                    <span>Total</span>
                    <span className="tabular-nums">
                      {formatMoney(nights * listing.nightlyPriceCents)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </section>
  );
}
