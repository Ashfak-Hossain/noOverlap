import { useEffect, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { parseISO, startOfToday } from 'date-fns';
import { nightsBetween, toDateParam } from '../../lib/format';
import 'react-day-picker/style.css';

/** True while the viewport is wide enough for a second month to fit. */
function useWideViewport(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 720);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 720px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

function Legend() {
  const items = [
    { className: 'bg-accent', label: 'Selected' },
    { className: 'bg-accent-soft', label: 'In range' },
    { className: 'bg-surface-2 border border-line', label: 'Open' },
  ];
  return (
    <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={['size-3 rounded', i.className].join(' ')} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Picks a stay's date range.
 *
 * The range is half-open, exactly as the database stores it: the check-out day is the morning you
 * leave, not a night you occupy. That is why one guest's check-out date can be another's check-in —
 * same-day turnover is legitimate, and greying out the checkout day would hide a night genuinely for
 * sale.
 *
 * Dates are handled as `yyyy-MM-dd` throughout rather than as timestamps. A local midnight converted
 * to an ISO instant lands on the previous day for anyone west of UTC, which would silently move a
 * booking; a plain calendar date cannot drift.
 *
 * No dates are marked unavailable. The API exposes no endpoint for which ranges are taken, and
 * guessing would be worse than staying quiet — it also mirrors how booking actually works here:
 * availability is decided by the database when you reserve, never pre-checked by the client.
 */
export function DateRangeField({
  checkIn,
  checkOut,
  onChange,
}: {
  checkIn: string;
  checkOut: string;
  onChange: (range: { checkIn: string; checkOut: string }) => void;
}) {
  const wide = useWideViewport();
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  const selected: DateRange | undefined = checkIn
    ? { from: parseISO(checkIn), to: checkOut ? parseISO(checkOut) : undefined }
    : undefined;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <DayPicker
        className="om-calendar"
        mode="range"
        numberOfMonths={wide ? 2 : 1}
        selected={selected}
        defaultMonth={checkIn ? parseISO(checkIn) : undefined}
        onSelect={(range) =>
          onChange({
            checkIn: range?.from ? toDateParam(range.from) : '',
            checkOut: range?.to ? toDateParam(range.to) : '',
          })
        }
        // A stay cannot begin in the past. Everything else is offered, because only the database can
        // say whether a range is genuinely free.
        disabled={{ before: startOfToday() }}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
        <Legend />
        <div className="flex items-center gap-3">
          <span role="status" className="text-[13px] font-semibold text-ink-muted">
            {nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'Pick your dates'}
          </span>
          {checkIn && (
            <button
              type="button"
              onClick={() => onChange({ checkIn: '', checkOut: '' })}
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
