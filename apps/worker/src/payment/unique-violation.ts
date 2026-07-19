import { Prisma } from '@no-overlap/db';

/**
 * True when the error is a unique-constraint violation.
 *
 * Prisma maps these to P2002 — unlike an exclusion-constraint violation, which has no Prisma mapping
 * and surfaces as a raw driver error instead.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
