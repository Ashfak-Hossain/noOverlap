import { useState } from 'react';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { formatDate } from '../../lib/format';
import { DateRangeField } from '../booking/DateRangeField';
import type { SearchCriteria } from './search-params';

function Cell({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={['flex flex-col gap-0.5 px-4 py-2.5', className].join(' ')}>
      <span className="text-[11.5px] font-bold tracking-[0.03em] text-ink-faint uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function GuestStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Fewer guests"
        className="flex size-6 items-center justify-center rounded-full border border-line-strong text-ink-muted disabled:opacity-40"
      >
        &minus;
      </button>
      {/* Announced as a value rather than left as a bare number between two buttons. */}
      <span
        role="status"
        aria-label={`${value} guests`}
        className="min-w-3 text-center text-[15px] font-semibold tabular-nums"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="More guests"
        className="flex size-6 items-center justify-center rounded-full border border-line-strong text-ink-muted"
      >
        +
      </button>
    </div>
  );
}

/** The search control. Every change writes straight to the URL, which is the source of truth. */
export function SearchBar({
  criteria,
  onChange,
  cities,
}: {
  criteria: SearchCriteria;
  onChange: (next: Partial<SearchCriteria>) => void;
  cities: string[];
}) {
  const [datesOpen, setDatesOpen] = useState(false);

  return (
    <div className="mt-7 rounded-[20px] border border-line bg-surface p-2.5 shadow-md">
      <div className="grid grid-cols-1 items-stretch gap-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_0.9fr_auto]">
        <Cell label="Where">
          <Select
            ariaLabel="City"
            value={criteria.city}
            onChange={(city) => onChange({ city })}
            placeholder="Anywhere"
            options={[
              { value: '', label: 'Anywhere' },
              ...cities.map((c) => ({ value: c, label: c })),
            ]}
            icon={
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 10.5c0 5.3-8 12-8 12s-8-6.7-8-12a8 8 0 1 1 16 0z" />
                <circle cx="12" cy="10.2" r="2.8" />
              </svg>
            }
          />
        </Cell>

        <Cell label="Check in" className="lg:border-l lg:border-line">
          <button
            type="button"
            onClick={() => setDatesOpen((o) => !o)}
            aria-expanded={datesOpen}
            className={[
              'text-left text-[15px] font-semibold transition-colors',
              criteria.checkIn ? 'text-ink' : 'text-ink-faint',
            ].join(' ')}
          >
            {criteria.checkIn ? formatDate(criteria.checkIn) : 'Add dates'}
          </button>
        </Cell>

        <Cell label="Check out" className="lg:border-l lg:border-line">
          <button
            type="button"
            onClick={() => setDatesOpen((o) => !o)}
            aria-expanded={datesOpen}
            className={[
              'text-left text-[15px] font-semibold transition-colors',
              criteria.checkOut ? 'text-ink' : 'text-ink-faint',
            ].join(' ')}
          >
            {criteria.checkOut ? formatDate(criteria.checkOut) : 'Add dates'}
          </button>
        </Cell>

        <Cell label="Guests" className="lg:border-l lg:border-line">
          <GuestStepper value={criteria.guests} onChange={(guests) => onChange({ guests })} />
        </Cell>

        <div className="flex items-stretch p-1">
          <Button className="w-full lg:px-6" onClick={() => setDatesOpen(false)}>
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.2-3.2" />
            </svg>
            Search
          </Button>
        </div>
      </div>

      {datesOpen && (
        // Anchored to the bar rather than pushed inline on wide screens, so opening the calendar
        // does not shove the results down the page.
        <div className="relative">
          <div className="animate-rise mt-2 lg:absolute lg:top-1 lg:left-1/2 lg:z-50 lg:w-max lg:-translate-x-1/2 lg:rounded-2xl lg:shadow-lg">
            <DateRangeField
              checkIn={criteria.checkIn}
              checkOut={criteria.checkOut}
              onChange={(range) => onChange(range)}
            />
            <div className="flex justify-end px-4 pb-4 lg:bg-surface lg:rounded-b-2xl lg:-mt-px lg:border-x lg:border-b lg:border-line">
              <Button size="sm" onClick={() => setDatesOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
