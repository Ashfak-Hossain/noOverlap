function Star({ fill, size }: { fill: number; size: number }) {
  // A single star, filled left-to-right by a clip so a 4.6 average reads as 4.6 rather than being
  // rounded to a whole star. Two layers instead of a gradient, which no assistive technology or
  // high-contrast mode renders reliably.
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <Glyph size={size} className="text-line-strong" />
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }}
      >
        <Glyph size={size} className="text-accent2" />
      </span>
    </span>
  );
}

function Glyph({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={['block', className].join(' ')}
    >
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95L12 2.6z" />
    </svg>
  );
}

/**
 * A rating, shown as stars with the figure beside them.
 *
 * The number is present rather than implied by the stars: 4.2 and 4.4 look identical at this size, and
 * the stars are decoration for a value the reader may actually want to compare.
 *
 * A listing with no reviews renders nothing at all. Showing an empty row of stars would read as a
 * score of zero, which is a rating a listing can genuinely earn — "nobody has said anything yet" and
 * "everyone hated it" must not look the same.
 */
export function Rating({
  value,
  count,
  size = 15,
}: {
  value: number | null;
  count: number;
  size?: number;
}) {
  if (value === null || count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} fill={value - i} size={size} />
        ))}
      </span>
      {/* The stars are hidden from assistive technology and the meaning carried here instead, so it is
          announced as one fact rather than five ambiguous images. */}
      <span className="text-[13.5px] font-semibold tabular-nums">
        <span className="sr-only">Rated </span>
        {value.toFixed(1)}
        <span className="sr-only"> out of 5</span>
      </span>
      <span className="text-[13px] text-ink-muted">
        ({count}
        <span className="sr-only"> {count === 1 ? 'review' : 'reviews'}</span>)
      </span>
    </span>
  );
}
