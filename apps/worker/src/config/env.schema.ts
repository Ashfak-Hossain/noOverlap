import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  // The mock provider's behaviour lives in config so the failure and compensation paths are
  // reproducible on demand rather than left to chance. 0 = never, 1 = always.
  PAYMENT_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  PAYMENT_TRANSIENT_RATE: z.coerce.number().min(0).max(1).default(0),
  PAYMENT_LATENCY_MS: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
