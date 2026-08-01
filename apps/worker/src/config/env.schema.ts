import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  // Optional because a local Redis on a private network has nothing to authenticate against, while a
  // managed one refuses every command without it. Left unset, the client simply never sends AUTH.
  // An empty value is normalized to absent: a declared-but-blank variable means "no password", and
  // passing the empty string through would make the client attempt to authenticate with it.
  REDIS_PASSWORD: z
    .string()
    .optional()
    .transform((value) => value || undefined),
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
