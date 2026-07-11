/** Postgres SQLSTATE for `exclusion_violation` — raised when a write conflicts with an exclusion constraint. */
const PG_EXCLUSION_VIOLATION = '23P01';

/**
 * Reports whether a failed write was rejected by an exclusion constraint (SQLSTATE `23P01`). For this
 * schema that always means the `no_overlapping_active_reservations` constraint (ADR-0003), since it is
 * the only exclusion constraint — so a match unambiguously means the slot was just taken. The caller
 * translates a match into `RESERVATION_SLOT_TAKEN`; anything else is a genuine failure and is rethrown.
 * If a second exclusion constraint is ever added, disambiguate by the constraint name.
 *
 * @remarks Under the Prisma 7 pg driver adapter an overlap surfaces as a `DriverAdapterError` whose
 * `cause` preserves the raw pg SQLSTATE on `originalCode` — the stable field to match, not the
 * locale-dependent message text. A bare driver error would instead carry it on `code`.
 */
export function isExclusionViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { originalCode?: string } };
  return (
    e?.cause?.originalCode === PG_EXCLUSION_VIOLATION ||
    e?.code === PG_EXCLUSION_VIOLATION
  );
}
