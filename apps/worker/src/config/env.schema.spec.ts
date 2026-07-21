/// <reference types="jest" />
import { validateEnv } from './env.schema';

const VALID = {
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/no_overlap',
};

describe('validateEnv', () => {
  it('parses a valid environment, applying coercion and defaults', () => {
    const env = validateEnv({ ...VALID });
    expect(env.REDIS_HOST).toBe('localhost');
    expect(env.REDIS_PORT).toBe(6379); // coerced from string → number
    expect(env.NODE_ENV).toBe('development'); // default applied
  });

  // The mock provider's defaults decide whether a charge succeeds at all, so they are pinned here:
  // a stray non-zero default would fail or decline every payment in every environment that omits them.
  it('defaults the payment provider to always succeeding, with no injected latency', () => {
    const env = validateEnv({ ...VALID });
    expect(env.PAYMENT_FAILURE_RATE).toBe(0);
    expect(env.PAYMENT_TRANSIENT_RATE).toBe(0);
    expect(env.PAYMENT_LATENCY_MS).toBe(0);
  });

  it('coerces the payment rates from strings, as they arrive from the environment', () => {
    const env = validateEnv({ ...VALID, PAYMENT_FAILURE_RATE: '1' });
    expect(env.PAYMENT_FAILURE_RATE).toBe(1);
  });

  it('rejects a failure rate outside 0..1', () => {
    expect(() => validateEnv({ ...VALID, PAYMENT_FAILURE_RATE: '2' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('throws when a required variable is missing', () => {
    expect(() => validateEnv({})).toThrow('Invalid environment configuration');
  });

  // The worker writes the payments table, so it fails at boot without a database rather than at the
  // first charge, when a booking would already be waiting on it.
  it('requires DATABASE_URL', () => {
    const { REDIS_HOST, REDIS_PORT } = VALID;
    expect(() => validateEnv({ REDIS_HOST, REDIS_PORT })).toThrow(
      'DATABASE_URL',
    );
  });
});
