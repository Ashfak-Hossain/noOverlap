import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@no-overlap/db';
import { TestAppModule } from './test-app.module';

const PASSWORD = 'correct-horse-battery-staple';
let seq = 0;

/** Boots a Nest application from {@link TestAppModule} against the Testcontainers database. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

/**
 * Registers a fresh user with the given role and logs them in, returning a usable access token.
 * Each call uses a unique email so tests never collide on the unique-email constraint.
 */
export async function registerAndLogin(
  app: INestApplication,
  role: Role = Role.GUEST,
): Promise<{ email: string; accessToken: string }> {
  const email = `u${Date.now()}-${seq++}@example.com`;
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: PASSWORD, role })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return { email, accessToken: res.body.accessToken as string };
}
