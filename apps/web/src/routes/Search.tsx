import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { StatusPill, type PillStatus } from '../components/StatusPill';
import { Card, EmptyState, Skeleton } from '../components/primitives';

const ALL_STATUSES: PillStatus[] = [
  'held',
  'confirmed',
  'cancelled',
  'expired',
  'completed',
  'processing',
  'paid',
  'failed',
  'refund-pending',
  'refunded',
];

/**
 * Temporary gallery of the design system, standing in for the search screen.
 *
 * It exists so the tokens and primitives can be checked in both themes before any screen depends on
 * them, and it is replaced by the real search UI in the next sub-phase.
 */
export function Component() {
  return (
    <section className="animate-rise py-14">
      <h1 className="max-w-[16ch] text-[clamp(32px,5vw,52px)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance">
        Find a place, and lock it in before anyone else.
      </h1>
      <p className="mt-4 max-w-[52ch] text-ink-muted">
        Design system check — every token, in both themes.
      </p>

      <h2 className="mt-14 mb-4 text-xl font-bold">Status system</h2>
      <div className="flex flex-wrap gap-2.5">
        {ALL_STATUSES.map((s) => (
          <StatusPill key={s} status={s} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ALL_STATUSES.map((s) => (
          <StatusPill key={s} status={s} size="sm" />
        ))}
      </div>

      <h2 className="mt-12 mb-4 text-xl font-bold">Buttons</h2>
      <div className="flex flex-wrap items-center gap-3">
        <Button>Reserve</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Cancel booking</Button>
        <Button loading>Securing</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>

      <h2 className="mt-12 mb-4 text-xl font-bold">Inputs</h2>
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <Field label="City" placeholder="Berlin" />
        <Field
          label="Email"
          type="email"
          defaultValue="not-an-email"
          error="Enter a valid email address."
        />
      </div>

      <h2 className="mt-12 mb-4 text-xl font-bold">Surfaces</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <StatusPill status="held" size="sm" />
          <h3 className="mt-2.5 font-bold">Sunny loft</h3>
          <p className="text-sm text-ink-muted">Berlin · 3 nights</p>
          <p className="mt-2 font-mono text-sm">€356.00</p>
        </Card>
        <Card className="flex flex-col gap-2.5 p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-20" />
        </Card>
        <EmptyState
          title="No stays match"
          description="Try widening your dates."
          action={
            <Button variant="secondary" size="sm">
              Clear filters
            </Button>
          }
        />
      </div>
    </section>
  );
}
