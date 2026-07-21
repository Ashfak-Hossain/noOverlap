import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card, EmptyState, Skeleton } from '../components/primitives';
import { DateRangeField } from '../features/booking/DateRangeField';
import { useSearchCriteria } from '../features/search/search-params';
import { getListing, listingKeys } from '../lib/api/listings';
import { formatDate, formatMoney, nightsBetween } from '../lib/format';
import { useSession } from '../lib/use-session';

function Gallery({ city }: { city: string }) {
  const pattern = (colour: string) =>
    `repeating-linear-gradient(135deg, color-mix(in oklab, ${colour} 9%, transparent) 0 2px, transparent 2px 15px)`;
  return (
    <div className="mt-5.5 grid h-85 grid-cols-1 grid-rows-2 gap-2.5 overflow-hidden rounded-[20px] sm:grid-cols-3">
      <div
        className="relative row-span-2 bg-surface-2 sm:col-span-2"
        style={{ backgroundImage: pattern('var(--accent)') }}
      >
        <span className="absolute bottom-3.5 left-3.5 rounded-[7px] bg-surface/70 px-2.5 py-1 font-mono text-[11.5px] text-ink-faint">
          {city.toLowerCase()} · hero photo
        </span>
      </div>
      {['interior', 'view'].map((label) => (
        <div
          key={label}
          className="relative hidden bg-surface-2 sm:block"
          style={{ backgroundImage: pattern('var(--accent-2)') }}
        >
          <span className="absolute bottom-3 left-3 font-mono text-[10.5px] text-ink-faint">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Component() {
  const { id = '' } = useParams();
  const [criteria, update] = useSearchCriteria();
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const { search } = useLocation();

  const {
    data: listing,
    isPending,
    isError,
  } = useQuery({
    queryKey: listingKeys.detail(id),
    queryFn: () => getListing(id),
    enabled: Boolean(id),
  });

  if (isPending) {
    return (
      <section className="py-8">
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="mt-5 h-85 rounded-[20px]" />
      </section>
    );
  }

  if (isError || !listing) {
    return (
      <section className="py-16">
        <EmptyState
          title="This stay isn’t available"
          description="It may have been removed, or the link is wrong."
          action={
            <Link to="/">
              <Button variant="secondary">Back to all stays</Button>
            </Link>
          }
        />
      </section>
    );
  }

  const nights =
    criteria.checkIn && criteria.checkOut ? nightsBetween(criteria.checkIn, criteria.checkOut) : 0;
  // The same arithmetic the server performs, so the figure shown is the figure charged. There are no
  // cleaning or service fees: the API levies none, and inventing them here would quote a total that
  // does not match the booking.
  const totalCents = nights * listing.nightlyPriceCents;
  const rangeValid = nights > 0;

  return (
    <section className="animate-rise pt-6.5 pb-18">
      <Link
        to="/"
        className="mb-4.5 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
      >
        <span aria-hidden="true">←</span> All stays
      </Link>

      <h1 className="text-[clamp(26px,3.4vw,36px)] font-extrabold tracking-tight">
        {listing.title}
      </h1>
      <p className="mt-2 text-[14.5px] text-ink-muted">
        {listing.city} · up to {listing.maxGuests} guests
      </p>

      <Gallery city={listing.city} />

      <div className="mt-9 grid items-start gap-13 lg:grid-cols-[1fr_384px]">
        <div>
          <div className="flex items-center gap-3.5 border-b border-line pb-5.5">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-full bg-accent2-soft text-[19px] font-bold text-accent2"
            >
              {listing.city.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="text-[15.5px] font-bold">Hosted in {listing.city}</p>
              <p className="mt-0.5 text-[13.5px] text-ink-muted">
                Sleeps up to {listing.maxGuests}
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-line pt-7.5">
            <h2 className="text-xl font-bold tracking-[-0.01em]">Choose your dates</h2>
            <p className="mt-1 mb-4.5 text-[13.5px] text-ink-muted">
              Checkout day is free, so same-day arrivals never clash.
            </p>
            <DateRangeField
              checkIn={criteria.checkIn}
              checkOut={criteria.checkOut}
              onChange={(range) => update(range)}
            />
          </div>
        </div>

        <aside className="lg:sticky lg:top-22">
          <Card className="p-5.5 shadow-md">
            <p className="text-2xl font-extrabold tracking-[-0.02em]">
              {formatMoney(listing.nightlyPriceCents)}
              <span className="text-[15px] font-medium text-ink-muted"> / night</span>
            </p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-line">
              <div className="grid grid-cols-2">
                <div className="border-r border-line px-3.5 py-2.5">
                  <p className="text-[10.5px] font-bold tracking-[0.04em] text-ink-faint uppercase">
                    Check in
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {criteria.checkIn ? formatDate(criteria.checkIn) : '—'}
                  </p>
                </div>
                <div className="px-3.5 py-2.5">
                  <p className="text-[10.5px] font-bold tracking-[0.04em] text-ink-faint uppercase">
                    Check out
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {criteria.checkOut ? formatDate(criteria.checkOut) : '—'}
                  </p>
                </div>
              </div>
            </div>

            {rangeValid && (
              <div className="mt-4.5 flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">
                    {formatMoney(listing.nightlyPriceCents)} × {nights}{' '}
                    {nights === 1 ? 'night' : 'nights'}
                  </span>
                  <span className="tabular-nums">{formatMoney(totalCents)}</span>
                </div>
                <div className="flex justify-between border-t border-line pt-3 text-[15.5px] font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(totalCents)}</span>
                </div>
              </div>
            )}

            {rangeValid ? (
              <Button
                size="lg"
                className="mt-4.5 w-full"
                onClick={() =>
                  isAuthenticated
                    ? void navigate(`/listings/${listing.id}/reserve${search}`)
                    : // Send them to sign in, remembering the reserve URL so they land back here —
                      // with their dates intact — rather than at the top of the site.
                      void navigate('/signin', {
                        state: {
                          from: `/listings/${listing.id}/reserve${search}`,
                        },
                      })
                }
              >
                {isAuthenticated ? 'Reserve' : 'Sign in to reserve'}
              </Button>
            ) : (
              <Button size="lg" disabled className="mt-4.5 w-full">
                Select dates to reserve
              </Button>
            )}

            <p className="mt-3.5 text-center text-[12.5px] text-ink-muted text-pretty">
              You won&rsquo;t be charged until your dates are held. A hold lasts 15 minutes while
              payment settles.
            </p>
          </Card>
        </aside>
      </div>
    </section>
  );
}
