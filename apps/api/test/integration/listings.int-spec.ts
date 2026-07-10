import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@no-overlap/db';
import { createTestApp, registerAndLogin } from './helpers';

const LISTING = { title: 'Loft', city: 'Berlin', nightlyPriceCents: 8900, maxGuests: 4 };

/**
 * The Phase 1 gate behaviours for Listings: a host can manage listings, RBAC blocks a guest, and
 * ownership blocks one host from touching another's — all over HTTP against a real database.
 */
describe('Listings (e2e)', () => {
  let app: INestApplication;
  let hostToken: string;
  let guestToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    hostToken = (await registerAndLogin(app, Role.HOST)).accessToken;
    guestToken = (await registerAndLogin(app, Role.GUEST)).accessToken;
  });
  afterAll(async () => {
    await app.close();
  });

  const create = (token: string) =>
    request(app.getHttpServer())
      .post('/listings')
      .set('Authorization', `Bearer ${token}`)
      .send(LISTING);

  it('lets a host create a listing, owned by them (201)', async () => {
    const res = await create(hostToken).expect(201);
    expect(res.body).toMatchObject({ city: 'Berlin' });
    expect(res.body.hostId).toBeDefined();
  });

  it('forbids a guest from creating a listing (403)', async () => {
    await create(guestToken).expect(403);
  });

  it('requires authentication to create a listing (401)', async () => {
    await request(app.getHttpServer()).post('/listings').send(LISTING).expect(401);
  });

  it("forbids a host from updating another host's listing (403)", async () => {
    const created = await create(hostToken).expect(201);
    const otherHost = (await registerAndLogin(app, Role.HOST)).accessToken;
    await request(app.getHttpServer())
      .patch(`/listings/${created.body.id}`)
      .set('Authorization', `Bearer ${otherHost}`)
      .send({ nightlyPriceCents: 1 })
      .expect(403);
  });

  it('returns active listings publicly (200)', async () => {
    const res = await request(app.getHttpServer()).get('/listings').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
