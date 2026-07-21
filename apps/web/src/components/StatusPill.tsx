import type { ReservationStatus } from '../lib/api/types';

/**
 * Every state a booking or its payment can be shown in.
 *
 * Reservation statuses and payment sub-states share one component deliberately: to a guest they are
 * one story ("where is my booking?"), and giving them a single visual language keeps a trip list
 * readable at a glance.
 */
export type PillStatus =
  | Lowercase<ReservationStatus>
  | 'processing'
  | 'paid'
  | 'failed'
  | 'refund-pending'
  | 'refunded';

type Tone = 'held' | 'confirmed' | 'cancelled' | 'expired' | 'completed';
type IconName = 'clock' | 'check' | 'x' | 'slash' | 'check-circle';

const STATUS: Record<PillStatus, { label: string; tone: Tone; icon: IconName }> = {
  held: { label: 'Held', tone: 'held', icon: 'clock' },
  confirmed: { label: 'Confirmed', tone: 'confirmed', icon: 'check' },
  expired: { label: 'Expired', tone: 'expired', icon: 'slash' },
  cancelled: { label: 'Cancelled', tone: 'cancelled', icon: 'x' },
  completed: { label: 'Completed', tone: 'completed', icon: 'check-circle' },
  processing: { label: 'Processing', tone: 'held', icon: 'clock' },
  paid: { label: 'Paid', tone: 'confirmed', icon: 'check' },
  failed: { label: 'Payment failed', tone: 'expired', icon: 'x' },
  'refund-pending': { label: 'Refund pending', tone: 'held', icon: 'clock' },
  refunded: { label: 'Refunded', tone: 'completed', icon: 'check' },
};

/**
 * Tone styling, written out rather than composed from a template string.
 *
 * Tailwind extracts class names by scanning source text, so a class assembled at runtime such as
 * `bg-${tone}-soft` is never generated. Listing them keeps every variant in the build.
 */
const TONE_CLASS: Record<Tone, string> = {
  held: 'text-held bg-held-soft border-held/30',
  confirmed: 'text-confirmed bg-confirmed-soft border-confirmed/30',
  cancelled: 'text-cancelled bg-cancelled-soft border-cancelled/30',
  expired: 'text-expired bg-expired-soft border-expired/30',
  completed: 'text-completed bg-completed-soft border-completed/30',
};

function Icon({ name, size }: { name: IconName; size: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    className: 'shrink-0',
  } as const;
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;

  switch (name) {
    case 'clock':
      return (
        <svg {...common} {...stroke}>
          <circle cx={12} cy={12} r={8.5} />
          <path d="M12 7.5V12l3.2 1.9" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common} {...stroke}>
          <path d="M4.5 12.5l4.6 4.6L19.5 7" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common} {...stroke}>
          <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
        </svg>
      );
    case 'slash':
      return (
        <svg {...common} {...stroke}>
          <circle cx={12} cy={12} r={8.5} />
          <path d="M6.4 6.4l11.2 11.2" />
        </svg>
      );
    case 'check-circle':
      return (
        <svg {...common} fill="currentColor">
          <circle cx={12} cy={12} r={9} />
          <path
            d="M7.8 12.2l3 3 5.2-5.6"
            fill="none"
            stroke="var(--surface)"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

/**
 * The status of a booking or its payment.
 *
 * Colour is never the only signal: every state carries a label and a distinct icon, so the pill is
 * still readable to someone who cannot separate the hues, and in greyscale. A held booking also
 * pulses, because it is the one state that is actively changing on its own.
 *
 * @param label overrides the default wording; the icon and colour still follow the status.
 */
export function StatusPill({
  status,
  size = 'md',
  label,
}: {
  status: PillStatus;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const meta = STATUS[status];
  const sm = size === 'sm';
  const text = label ?? meta.label;

  return (
    <span
      role="status"
      aria-label={`Status: ${text}`}
      className={[
        'inline-flex items-center rounded-full border font-semibold leading-none whitespace-nowrap',
        TONE_CLASS[meta.tone],
        sm ? 'gap-1.25 px-2 py-0.75 text-[11.5px]' : 'gap-1.5 px-2.5 py-1 text-[12.5px]',
      ].join(' ')}
    >
      {meta.tone === 'held' && (
        <span
          aria-hidden="true"
          className={[
            'shrink-0 rounded-full bg-current animate-pulse-dot',
            sm ? 'size-1.25' : 'size-1.5',
          ].join(' ')}
        />
      )}
      <Icon name={meta.icon} size={sm ? 12 : 13.5} />
      <span>{text}</span>
    </span>
  );
}
