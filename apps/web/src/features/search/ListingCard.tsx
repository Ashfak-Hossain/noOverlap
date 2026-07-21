import { Link } from 'react-router';
import { formatMoney } from '../../lib/format';
import type { Listing } from '../../lib/api/types';

/**
 * Stand-in artwork for a listing.
 *
 * The API stores no photos, so rather than pull in unrelated stock imagery the card shows a patterned
 * placeholder that is honestly a placeholder.
 */
function PhotoPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="relative aspect-4/3 bg-surface-2"
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, color-mix(in oklab, var(--accent) 8%, transparent) 0 2px, transparent 2px 13px)',
      }}
    >
      <span className="absolute bottom-3 left-3 rounded-md bg-surface/75 px-2 py-0.5 font-mono text-[11px] text-ink-faint">
        {label}
      </span>
    </div>
  );
}

/**
 * One listing in the results grid.
 *
 * The whole card is a single link rather than a clickable div, so it is reachable by keyboard and
 * offers the middle-click and open-in-new-tab behaviour people expect of a result.
 *
 * Search dates ride along in the link, so choosing a place keeps the dates already chosen.
 */
export function ListingCard({ listing, search }: { listing: Listing; search: string }) {
  return (
    <Link
      to={`/listings/${listing.id}${search}`}
      className="group block overflow-hidden rounded-[18px] border border-line bg-surface shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lg"
    >
      <PhotoPlaceholder label={listing.city.toLowerCase()} />
      <div className="px-4 pt-4 pb-4.5">
        <span className="text-[12.5px] font-semibold text-ink-muted">{listing.city}</span>
        <h3 className="mt-1.5 text-[16.5px] font-bold tracking-[-0.01em] text-pretty">
          {listing.title}
        </h3>
        <p className="mt-2.5 text-[15px]">
          <span className="font-bold">{formatMoney(listing.nightlyPriceCents)}</span>
          <span className="font-medium text-ink-muted"> / night</span>
        </p>
        <p className="mt-1 text-[12.5px] text-ink-faint">Up to {listing.maxGuests} guests</p>
      </div>
    </Link>
  );
}
