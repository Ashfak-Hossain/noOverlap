import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { Button } from '../components/Button';
import { Card, EmptyState, Skeleton } from '../components/primitives';
import { ListingCard } from '../features/search/ListingCard';
import { SearchBar } from '../features/search/SearchBar';
import { useSearchCriteria } from '../features/search/search-params';
import { listListings, listingKeys } from '../lib/api/listings';

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-6">
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="aspect-4/3 rounded-none" />
          <div className="flex flex-col gap-2.5 p-4">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function Component() {
  const [criteria, update] = useSearchCriteria();
  const { search } = useLocation();

  const { data, isPending, isError } = useQuery({
    queryKey: listingKeys.browse(criteria.city),
    queryFn: () => listListings(criteria.city || undefined),
  });

  // The city list is derived from what actually came back rather than hard-coded, so it can never
  // offer somewhere with nothing to book.
  const cities = [...new Set((data ?? []).map((l) => l.city))].sort();

  // Capacity is filtered here because the API does not filter by it. Dates deliberately do not filter
  // anything: there is no availability-search endpoint, so a listing is offered and the reservation
  // itself decides whether those nights are free.
  const results = (data ?? []).filter((l) => l.maxGuests >= criteria.guests);

  return (
    <>
      {/*
        Positioned and lifted above the results below. `animate-rise` runs an animation on a
        transform, which gives this section its own stacking context — so the date popover's z-index
        only orders it *within* this section. Without an explicit order between the two sections, the
        results grid paints later and swallows the calendar.
      */}
      <section className="animate-rise relative z-30 pt-14 pb-2">
        <p className="mb-3.5 text-[13px] font-semibold tracking-[0.04em] text-accent uppercase">
          Stay somewhere · never double-booked
        </p>
        <h1 className="max-w-[16ch] text-[clamp(32px,5vw,52px)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance">
          Find a place, and lock it in before anyone else.
        </h1>
        <p className="mt-4.5 max-w-[52ch] text-[17px] text-ink-muted text-pretty">
          Pick your dates and we hold them the instant you reserve. Exactly one guest can win any
          slot — no accidental double-bookings, no &ldquo;sorry, it was gone&rdquo; after you pay.
        </p>

        <SearchBar criteria={criteria} onChange={update} cities={cities} />
        <p className="mt-3 px-0.5 text-[12.5px] text-ink-faint">
          Availability is confirmed the moment you reserve. Prices in USD, per night.
        </p>
      </section>

      <section className="relative z-0 pt-8 pb-18">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="text-[21px] font-bold tracking-[-0.01em]">
            {criteria.city ? `Stays in ${criteria.city}` : 'All stays'}
          </h2>
          {!isPending && !isError && (
            <span className="text-[13.5px] font-semibold text-ink-muted">
              {results.length} {results.length === 1 ? 'place' : 'places'}
            </span>
          )}
        </div>

        {isPending && <ResultsSkeleton />}

        {isError && (
          <EmptyState
            title="Couldn’t load stays"
            description="Something went wrong reaching the server. Try again in a moment."
          />
        )}

        {!isPending && !isError && results.length === 0 && (
          <EmptyState
            title="No stays match your search"
            description="Try another city or lower the guest count — there’s plenty of room somewhere."
            action={
              <Button
                variant="secondary"
                onClick={() => update({ city: '', guests: 1, checkIn: '', checkOut: '' })}
              >
                Reset filters
              </Button>
            }
          />
        )}

        {!isPending && !isError && results.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-6">
            {results.map((listing) => (
              <ListingCard key={listing.id} listing={listing} search={search} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
