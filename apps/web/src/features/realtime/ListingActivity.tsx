import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listingKeys } from '../../lib/api/listings';
import { reservationKeys } from '../../lib/api/reservations';
import { useListingUpdates } from '../../lib/realtime/use-listing-updates';
import type { ReservationChanged } from '@no-overlap/contracts/realtime';

/** What a status change means to someone looking at the listing, rather than to the booking itself. */
function describe(event: ReservationChanged): string {
  switch (event.status) {
    case 'HELD':
      return 'Someone just started booking dates on this stay.';
    case 'CONFIRMED':
      return 'A booking on this stay was just confirmed.';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'Dates just opened up again on this stay.';
    case 'COMPLETED':
      return 'A stay here just wrapped up.';
  }
}

/**
 * Live activity on the listing being viewed.
 *
 * Availability is decided by the database at the moment of reserving, never pre-checked by the client,
 * so this cannot claim which dates are free — and does not try to. What it can honestly say is that
 * the listing changed while the page was open, which is the difference between a guest choosing dates
 * against a stale picture and one who knows to re-check.
 *
 * The banner replaces itself rather than accumulating: on a busy listing a growing list of
 * notifications is noise, and only the most recent one is actionable.
 */
export function ListingActivity({ listingId }: { listingId: string }) {
  const [notice, setNotice] = useState<{ text: string; seq: number } | null>(null);
  const queryClient = useQueryClient();

  useListingUpdates([listingId], ({ event, reason }) => {
    // A pushed message is a prompt to re-read, never the new truth, so anything scoped to this listing
    // is dropped from the cache and fetched again rather than patched from the payload.
    void queryClient.invalidateQueries({ queryKey: listingKeys.detail(listingId) });
    void queryClient.invalidateQueries({ queryKey: reservationKeys.all });

    setNotice({
      text:
        reason === 'reconnect'
          ? 'Reconnected — refreshed in case anything changed while you were offline.'
          : reason === 'gap'
            ? 'You missed an update, so this page has been refreshed.'
            : event
              ? describe(event)
              : 'This stay was just updated.',
      // The sequence doubles as a render key, so two identical messages in a row still replay the
      // animation instead of looking like nothing happened.
      seq: event?.seq ?? -1,
    });
  });

  if (!notice) return null;

  return (
    <p
      key={notice.seq}
      role="status"
      aria-live="polite"
      className="animate-rise mt-4 flex items-center gap-2.5 rounded-xl border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-[13.5px] font-medium text-ink"
    >
      <span aria-hidden="true" className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />
        <span className="relative inline-flex size-2 rounded-full bg-accent" />
      </span>
      {notice.text}
    </p>
  );
}
