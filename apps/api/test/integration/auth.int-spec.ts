import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@no-overlap/db';
import { createTestApp, registerAndLogin } from './helpers';

const PASSWORD = 'correct-horse-battery-staple';

/** Core identity behaviours, driven over HTTP against a real database. */
describe('Identity (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('registers a user and never returns the password hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `reg-${Date.now()}@example.com`,
        password: PASSWORD,
        role: 'GUEST',
      })
      .expect(201);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).toMatchObject({ role: 'GUEST' });
  });

  it('rejects a duplicate email with 409', async () => {
    const body = {
      email: `dup-${Date.now()}@example.com`,
      password: PASSWORD,
      role: 'GUEST',
    };
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(409);
  });

  it('rejects an invalid registration DTO with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short', role: 'GUEST' })
      .expect(400);
  });

  it('rejects bad credentials with 401', async () => {
    const email = `bad-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: PASSWORD, role: 'GUEST' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects a protected route without a token (401)', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns the caller on /auth/me with a valid token', async () => {
    const { accessToken } = await registerAndLogin(app, Role.HOST);
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ role: 'HOST' });
  });
});
