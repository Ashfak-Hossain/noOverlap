/// <reference types="jest" />
import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('parses a valid environment, applying coercion and defaults', () => {
    const env = validateEnv({ REDIS_HOST: 'localhost', REDIS_PORT: '6379' });
    expect(env.REDIS_HOST).toBe('localhost');
    expect(env.REDIS_PORT).toBe(6379); // coerced from string → number
    expect(env.NODE_ENV).toBe('development'); // default applied
  });

  it('throws when a required variable is missing', () => {
    expect(() => validateEnv({})).toThrow('Invalid environment configuration');
  });
});
