import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Card, EmptyState, Skeleton } from '../../components/primitives';
import { apiFetch } from '../../lib/api/client';
import { listMyListings, listingKeys } from '../../lib/api/listings';
import { ApiError } from '../../lib/api/problem';
import type { Listing } from '../../lib/api/types';
import { formatMoney } from '../../lib/format';

interface ListingForm {
  title: string;
  city: string;
  /** Whole currency as the host types it; converted to cents on submit. */
  price: string;
  maxGuests: string;
}

const EMPTY: ListingForm = { title: '', city: '', price: '', maxGuests: '2' };

/**
 * Converts a typed price into integer cents.
 *
 * Money is stored and charged in cents, so this conversion happens once, at the boundary. Rounding
 * rather than truncating matters: `89.95 * 100` is `8994.999…` in binary floating point, which would
 * quietly under-price the listing by a cent on every night booked.
 */
function toCents(price: string): number {
  return Math.round(Number(price) * 100);
}

function ListingEditor({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ListingForm>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch<Listing>('/listings', { method: 'POST', body }),
    onSuccess: () => {
      // The new listing belongs in both the host's own list and public browse results.
      void queryClient.invalidateQueries({ queryKey: listingKeys.all });
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        if (Object.keys(error.fieldErrors).length === 0)
          setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    },
  });

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    create.mutate({
      title: form.title,
      city: form.city,
      nightlyPriceCents: toCents(form.price),
      maxGuests: Number(form.maxGuests),
    });
  }

  return (
    <Card className="mb-8 p-6">
      <h2 className="mb-4 text-lg font-bold">New listing</h2>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Title"
            placeholder="Sunny loft near the park"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={fieldErrors.title}
            required
          />
          <Field
            label="City"
            placeholder="Berlin"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            error={fieldErrors.city}
            required
          />
          <Field
            label="Price per night"
            type="number"
            min="0"
            step="0.01"
            placeholder="89.00"
            hint="In whole currency — stored to the cent."
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            // The server validates the converted cents, so its complaint arrives under that name.
            error={fieldErrors.nightlyPriceCents}
            required
          />
          <Field
            label="Maximum guests"
            type="number"
            min="1"
            max="64"
            value={form.maxGuests}
            onChange={(e) => setForm({ ...form, maxGuests: e.target.value })}
            error={fieldErrors.maxGuests}
            required
          />
        </div>

        {formError && (
          <p
            role="alert"
            className="rounded-xl border border-expired/30 bg-expired-soft px-3.5 py-2.5 text-sm font-medium text-expired"
          >
            {formError}
          </p>
        )}

        <div className="flex gap-2.5">
          <Button type="submit" loading={create.isPending}>
            Publish listing
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function Component() {
  const [editing, setEditing] = useState(false);

  const { data: listings, isPending } = useQuery({
    queryKey: listingKeys.mine(),
    queryFn: listMyListings,
  });

  return (
    <section className="animate-rise pt-11 pb-18">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[clamp(26px,3.4vw,34px)] font-extrabold tracking-tight">
            Your listings
          </h1>
          <p className="mt-2 text-[15px] text-ink-muted">
            Everything you host, and what it earns per night.
          </p>
        </div>
        {!editing && (
          <Button onClick={() => setEditing(true)}>Add a listing</Button>
        )}
      </div>

      {editing && <ListingEditor onDone={() => setEditing(false)} />}

      {isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-6">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : (listings ?? []).length === 0 ? (
        <EmptyState
          title="No listings yet"
          description="Publish a place and it becomes bookable straight away."
          action={
            !editing && (
              <Button onClick={() => setEditing(true)}>
                Add your first listing
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-6">
          {(listings ?? []).map((listing) => (
            <Card key={listing.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[16.5px] font-bold">
                    {listing.title}
                  </h3>
                  <p className="mt-1 text-[13.5px] text-ink-muted">
                    {listing.city}
                  </p>
                </div>
                <span
                  className={[
                    'shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold',
                    listing.active
                      ? 'border-confirmed/30 bg-confirmed-soft text-confirmed'
                      : 'border-cancelled/30 bg-cancelled-soft text-cancelled',
                  ].join(' ')}
                >
                  {listing.active ? 'Bookable' : 'Paused'}
                </span>
              </div>
              <p className="mt-4 text-lg font-bold">
                {formatMoney(listing.nightlyPriceCents)}
                <span className="text-[13.5px] font-medium text-ink-muted">
                  {' '}
                  / night
                </span>
              </p>
              <p className="mt-1 text-[12.5px] text-ink-faint">
                Sleeps up to {listing.maxGuests}
              </p>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
