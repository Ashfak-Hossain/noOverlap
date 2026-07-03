import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { Env } from '../config/env.schema';

export const PG_POOL = 'PG_POOL';

export const postgresProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<Env, true>) =>
    new Pool({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
    }),
};
