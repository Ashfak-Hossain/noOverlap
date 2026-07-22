import { Prisma } from '@no-overlap/db';

/** Postgres SQLSTATE for `foreign_key_violation` — a row is still referenced, or references nothing. */
const PG_FOREIGN_KEY_VIOLATION = '23503';

/** Prisma's own code for the same condition, raised when it recognises the constraint itself. */
const PRISMA_FOREIGN_KEY_VIOLATION = 'P2003';

/**
 * Reports whether a failed write was rejected by a foreign key.
 *
 * For a delete in this schema that means rows still reference the target — the restricting constraint
 * on `reservations.listing_id` is the only one that can refuse one. The caller translates a match into
 * a refusal the client can act on; anything else is a genuine failure and is rethrown.
 *
 * @remarks Matched on both the SQLSTATE and Prisma's own code because the driver adapter does not
 * always classify the error before it surfaces: a recognised violation arrives as a
 * `PrismaClientKnownRequestError`, while one raised inside a raw statement keeps only the SQLSTATE on
 * `cause.originalCode`. Matching the message text instead would break with the server's locale.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === PRISMA_FOREIGN_KEY_VIOLATION
  ) {
    return true;
  }
  const e = err as { code?: string; cause?: { originalCode?: string } };
  return (
    e?.cause?.originalCode === PG_FOREIGN_KEY_VIOLATION ||
    e?.code === PG_FOREIGN_KEY_VIOLATION
  );
}
