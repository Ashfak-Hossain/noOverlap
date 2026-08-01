/** Postgres SQLSTATE for `exclusion_violation` — raised when a write conflicts with an exclusion constraint. */
const PG_EXCLUSION_VIOLATION = '23P01';

/** Postgres SQLSTATE for `deadlock_detected` — one transaction aborted to break a lock cycle. */
const PG_DEADLOCK_DETECTED = '40P01';

/** Pulls the SQLSTATE out of a failed write, wherever the driver happened to put it. */
function sqlState(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { originalCode?: string } };
  return e?.cause?.originalCode ?? e?.code;
}

/**
 * Reports whether a failed write was rejected by an exclusion constraint (SQLSTATE `23P01`). For this
 * schema that always means the `no_overlapping_active_reservations` constraint, since it is
 * the only exclusion constraint — so a match unambiguously means the slot was just taken. The caller
 * translates a match into `RESERVATION_SLOT_TAKEN`; anything else is a genuine failure and is rethrown.
 * If a second exclusion constraint is ever added, disambiguate by the constraint name.
 *
 * @remarks Under the Prisma 7 pg driver adapter an overlap surfaces as a `DriverAdapterError` whose
 * `cause` preserves the raw pg SQLSTATE on `originalCode` — the stable field to match, not the
 * locale-dependent message text. A bare driver error would instead carry it on `code`.
 */
export function isExclusionViolation(err: unknown): boolean {
  return sqlState(err) === PG_EXCLUSION_VIOLATION;
}

/**
 * Reports whether Postgres aborted the write to break a deadlock (SQLSTATE `40P01`).
 *
 * On the booking path this is the same event as an overlap, seen from a different angle. Several
 * holds for one slot arrive together, each waiting on the others' unfinished inserts, and Postgres
 * resolves the cycle by choosing one to abort. Nothing it wrote survives, so a deadlock never
 * produces a double booking — but it also never reaches the exclusion constraint, so it arrives here
 * as a server fault rather than as the lost race it actually is.
 *
 * Deadlocks are transient by nature: the standard response is to run the statement again, which is
 * what the caller does. By the time a retry runs, whichever hold won has committed, and the retry
 * gets the constraint's real answer instead.
 */
export function isDeadlock(err: unknown): boolean {
  return sqlState(err) === PG_DEADLOCK_DETECTED;
}
