import { z } from 'zod';

/**
 * Environment contract. Boot fails fast if any variable is missing or
 * malformed, so a misconfigured process never begins serving traffic.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  // Auth secrets. Keys are base64-encoded PEM so a multi-line PEM survives as one env
  // value — the same shape a managed secret store hands over in production. RS256 splits trust:
  // the private key signs access tokens, the public key only verifies them. TTLs are strings
  // because they pass straight to the JWT layer's `expiresIn`; access is
  // short-lived, refresh is long-lived and rotated on every use.
  // `min(1)` only guarantees presence — a malformed key surfaces at first sign/verify, not at boot.
  JWT_PRIVATE_KEY_B64: z.string().min(1),
  JWT_PUBLIC_KEY_B64: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  HOLD_TTL: z.string().min(1).default('15m'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and normalizes the raw environment for `ConfigModule.forRoot({ validate })`.
 *
 * Throws rather than returning errors so Nest aborts bootstrap — a misconfigured process must never
 * begin serving traffic. The returned value is the coerced, default-applied config, so every
 * downstream read is already typed and normalized (`PORT` is a number, TTLs have their defaults).
 */
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
