import { Prisma } from '@no-overlap/db';

/** Postgres SQLSTATE for `exclusion_violation` — raised when a write conflicts with an exclusion constraint. */
const PG_EXCLUSION_VIOLATION = '23P01';

/**
 * Reports whether a failed write was rejected by the `no_overlapping_active_reservations` exclusion
 * constraint (ADR-0003) — i.e. a concurrent booking already holds the range. The caller translates a
 * match into `RESERVATION_SLOT_TAKEN`; anything else is a genuine failure and must be rethrown.
 *
 * The probe exists because Prisma does not expose the driver's raw SQLSTATE through a stable field:
 * depending on the query path the `23P01` arrives in one of two shapes, so both are checked.
 */
export function isExclusionViolation(err: unknown): boolean {
  // Typed request errors bury the driver payload in `meta`, whose shape shifts across versions;
  // stringify and scan for the code rather than depend on a particular nesting.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (JSON.stringify(err.meta ?? '').includes(PG_EXCLUSION_VIOLATION))
      return true;
  }
  // Untyped errors (e.g. a raw driver error surfacing through Prisma) carry the SQLSTATE on `code`.
  const code = (err as { code?: string })?.code;
  return code === PG_EXCLUSION_VIOLATION;
}
