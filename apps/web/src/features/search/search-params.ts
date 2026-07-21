import { useSearchParams } from 'react-router';

export interface SearchCriteria {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

/**
 * Search criteria, stored in the URL rather than in component state.
 *
 * That choice is what makes a set of results shareable, bookmarkable, and survive both a refresh and
 * the back button — none of which is true of state held in a component.
 */
export function useSearchCriteria(): [SearchCriteria, (next: Partial<SearchCriteria>) => void] {
  const [params, setParams] = useSearchParams();

  const criteria: SearchCriteria = {
    city: params.get('city') ?? '',
    checkIn: params.get('checkIn') ?? '',
    checkOut: params.get('checkOut') ?? '',
    guests: Number(params.get('guests') ?? '1') || 1,
  };

  function update(next: Partial<SearchCriteria>): void {
    const merged = { ...criteria, ...next };
    const url = new URLSearchParams();
    if (merged.city) url.set('city', merged.city);
    if (merged.checkIn) url.set('checkIn', merged.checkIn);
    if (merged.checkOut) url.set('checkOut', merged.checkOut);
    if (merged.guests > 1) url.set('guests', String(merged.guests));
    // Replace rather than push: refining a search should not bury the previous page under a dozen
    // history entries the back button has to walk out of.
    setParams(url, { replace: true });
  }

  return [criteria, update];
}
