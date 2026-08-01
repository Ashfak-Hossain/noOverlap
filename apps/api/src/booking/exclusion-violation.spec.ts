import { isDeadlock, isExclusionViolation } from './exclusion-violation';

/**
 * The two ways Postgres refuses a racing hold, and how they are told apart.
 *
 * Worth pinning because the codes are matched against a field whose location depends on how the
 * error reached us. Prisma's driver adapter wraps the raw failure, so the SQLSTATE moves from `code`
 * to `cause.originalCode` — and matching the wrong one fails silently: an overlap stops being a
 * conflict and starts being a server error, which is precisely the bug this pair exists to avoid.
 */
describe('Postgres write-conflict detection', () => {
  // How an overlap arrives through the Prisma pg driver adapter.
  const adapterError = (code: string) => ({ cause: { originalCode: code } });
  // How it arrives from a bare driver error, without the adapter wrapping it.
  const driverError = (code: string) => ({ code });

  describe('isExclusionViolation', () => {
    it('recognises 23P01 through the adapter and from a bare driver error', () => {
      expect(isExclusionViolation(adapterError('23P01'))).toBe(true);
      expect(isExclusionViolation(driverError('23P01'))).toBe(true);
    });

    it('does not claim a deadlock as an overlap', () => {
      // They mean the same thing to a guest and different things to the caller: an overlap is final,
      // a deadlock is worth retrying. Confusing them would either retry a settled answer or report a
      // transient one as permanent.
      expect(isExclusionViolation(adapterError('40P01'))).toBe(false);
    });

    it('ignores unrelated failures', () => {
      expect(isExclusionViolation(adapterError('23505'))).toBe(false);
      expect(isExclusionViolation(new Error('connection lost'))).toBe(false);
      expect(isExclusionViolation(null)).toBe(false);
      expect(isExclusionViolation(undefined)).toBe(false);
    });
  });

  describe('isDeadlock', () => {
    it('recognises 40P01 through the adapter and from a bare driver error', () => {
      expect(isDeadlock(adapterError('40P01'))).toBe(true);
      expect(isDeadlock(driverError('40P01'))).toBe(true);
    });

    it('does not claim an overlap as a deadlock', () => {
      expect(isDeadlock(adapterError('23P01'))).toBe(false);
    });

    it('ignores unrelated failures', () => {
      expect(isDeadlock(adapterError('40001'))).toBe(false); // serialization failure, not a deadlock
      expect(isDeadlock(new Error('connection lost'))).toBe(false);
      expect(isDeadlock(null)).toBe(false);
    });
  });
});
