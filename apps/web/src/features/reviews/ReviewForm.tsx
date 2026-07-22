import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/Button';
import { createReview, reviewKeys } from '../../lib/api/reviews';
import { ApiError } from '../../lib/api/problem';
import { reservationKeys } from '../../lib/api/reservations';

/** What each score means, so a rating is a judgement rather than a number the guest has to invent. */
const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'] as const;

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value;

  return (
    // A radio group, not five buttons: the choices are mutually exclusive, and this is what gives
    // arrow-key selection and a single tab stop for free rather than reimplementing both.
    <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of 5 — ${LABELS[n]}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(n)}
          onBlur={() => setHovered(null)}
          className="rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={n <= shown ? 'text-accent2' : 'text-line-strong'}
          >
            <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95L12 2.6z" />
          </svg>
        </button>
      ))}
      <span className="ml-2 text-[13px] font-semibold text-ink-muted">
        {shown > 0 ? LABELS[shown] : 'Pick a rating'}
      </span>
    </div>
  );
}

/**
 * Leaves a review for a stay that has ended.
 *
 * The server owns the rule about who may review and when; this form only offers itself where that is
 * plausible. Its refusals are still rendered, because "already reviewed" is reachable from a second
 * tab and a client-side guess about eligibility is not a substitute for the server's answer.
 */
export function ReviewForm({
  reservationId,
  listingId,
  onDone,
}: {
  reservationId: string;
  listingId: string;
  onDone?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const queryClient = useQueryClient();

  const submit = useMutation({
    mutationFn: createReview,
    onSuccess: () => {
      // The listing's rating changed, and the trip now has a review — both cached elsewhere.
      void queryClient.invalidateQueries({ queryKey: reviewKeys.forListing(listingId) });
      void queryClient.invalidateQueries({ queryKey: reservationKeys.all });
      onDone?.();
    },
  });

  const alreadyReviewed =
    submit.error instanceof ApiError && submit.error.code === 'REVIEW_ALREADY_EXISTS';

  return (
    <form
      className="flex flex-col gap-3.5 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating === 0) return;
        submit.mutate({
          reservationId,
          rating,
          // An empty comment is no comment: sending "" would store an empty string where the API
          // means "nothing was written".
          body: body.trim() || undefined,
        });
      }}
    >
      <StarInput value={rating} onChange={setRating} />

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Anything worth telling the next guest?</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Optional — what stood out, good or bad."
          className="resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </label>

      {submit.isError && (
        <p role="alert" className="text-[13px] font-medium text-expired">
          {alreadyReviewed
            ? 'You’ve already reviewed this stay.'
            : submit.error instanceof ApiError
              ? submit.error.message
              : 'Couldn’t save your review. Please try again.'}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={submit.isPending} disabled={rating === 0}>
          Post review
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
