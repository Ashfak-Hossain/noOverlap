import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@no-overlap/db';
import { createTestApp, registerAndLogin } from './helpers';

const LISTING = {
  title: 'Loft',
  city: 'Berlin',
  nightlyPriceCents: 8900,
  maxGuests: 4,
};

/**
 * Core behaviours for Listings: a host can manage listings, RBAC blocks a guest, and ownership
 * blocks one host from touching another's — all over HTTP against a real database.
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
    await request(app.getHttpServer())
      .post('/listings')
      .send(LISTING)
      .expect(401);
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

  describe('deleting', () => {
    const DAY = 86_400_000;
    let seq = 0;
    const futureRange = () => {
      const base = 2500 + seq++ * 10; // distinct windows so nothing collides
      return {
        checkIn: new Date(Date.now() + base * DAY).toISOString(),
        checkOut: new Date(Date.now() + (base + 2) * DAY).toISOString(),
      };
    };

    it('deletes a listing nobody has booked (204)', async () => {
      const created = await create(hostToken).expect(201);
      await request(app.getHttpServer())
        .delete(`/listings/${created.body.id}`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/listings/${created.body.id}`)
        .expect(404);
    });

    it('refuses to delete a listing that has bookings, and keeps them (409)', async () => {
      const created = await create(hostToken).expect(201);
      const booked = await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ listingId: created.body.id, ...futureRange() })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/listings/${created.body.id}`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(409);
      expect(res.body.type).toContain('listing-has-bookings');

      // The point of the refusal: the guest's reservation is still there. Cascading the delete would
      // have removed a booking they may have paid for, with nothing left to show it existed.
      await request(app.getHttpServer())
        .get(`/reservations/${booked.body.id}`)
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/listings/${created.body.id}`)
        .expect(200);
    });

    it('pauses a booked listing instead: hidden from search, bookings intact', async () => {
      const created = await create(hostToken).expect(201);
      await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ listingId: created.body.id, ...futureRange() })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/listings/${created.body.id}`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ active: false })
        .expect(200);

      const browse = await request(app.getHttpServer())
        .get('/listings')
        .expect(200);
      expect(
        (browse.body as Array<{ id: string }>).some(
          (l) => l.id === created.body.id,
        ),
      ).toBe(false);
    });

    it("forbids a host from deleting another host's listing (403)", async () => {
      const created = await create(hostToken).expect(201);
      const otherHost = (await registerAndLogin(app, Role.HOST)).accessToken;
      await request(app.getHttpServer())
        .delete(`/listings/${created.body.id}`)
        .set('Authorization', `Bearer ${otherHost}`)
        .expect(403);
    });
  });
});
