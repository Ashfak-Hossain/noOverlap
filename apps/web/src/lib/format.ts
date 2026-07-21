import { differenceInCalendarDays, format, parseISO } from 'date-fns';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/**
 * Renders integer cents as currency.
 *
 * Money is carried as cents end to end and only divided here, at the very edge, so no arithmetic
 * ever happens in floating point where 35600 could become 356.00000000000006.
 */
export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

/** A date a guest can read without ambiguity — "Fri 1 Aug", never 01/08 or 08/01. */
export function formatDate(iso: string): string {
  return format(parseISO(iso), 'EEE d MMM');
}

export function formatDateLong(iso: string): string {
  return format(parseISO(iso), 'EEE d MMM yyyy');
}

/** The `yyyy-MM-dd` form used in URLs and sent to the API. */
export function toDateParam(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Nights between two dates, counted the way the server counts them.
 *
 * The API computes nights from calendar dates rather than elapsed hours, and the range is half-open:
 * the checkout day is not a night. Counting calendar days between date-only values reproduces that
 * exactly, so the total shown here is the total that gets charged.
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));
}
