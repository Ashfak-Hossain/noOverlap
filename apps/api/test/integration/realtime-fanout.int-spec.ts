import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@no-overlap/db';
import {
  RESERVATION_CHANGED,
  type ReservationChanged,
} from '@no-overlap/contracts';
import { io, type Socket } from 'socket.io-client';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../src/redis/redis.provider';
import { RedisIoAdapter } from '../../src/realtime/redis-io.adapter';
import { TestAppModule } from './test-app.module';
import { registerAndLogin } from './helpers';

const DAY = 86_400_000;

/**
 * Cross-instance fan-out: an event raised on one API instance reaches a client connected to another.
 *
 * This is the failure the Redis adapter exists to prevent, and the one least likely to be noticed
 * without a test. A gateway only knows the sockets connected to its own process, so with a single
 * instance — which is what development and every other suite here run — the feature works whether or
 * not the adapter is installed. It breaks only behind a load balancer, in production, silently and
 * for a fraction of users.
 *
 * Two applications are booted in one process, each listening on its own port and each installing the
 * adapter exactly as the entry point does. Sharing a process is not sharing state: the gateways hold
 * separate socket servers, so a client connected to one is genuinely invisible to the other unless
 * Redis carries the message between them.
 */
describe('Realtime — cross-instance fan-out (e2e)', () => {
  let alpha: INestApplication;
  let beta: INestApplication;
  let betaUrl: string;
  let hostToken: string;
  let guestToken: string;
  const sockets: Socket[] = [];

  /**
   * Boots an application with the Redis socket adapter installed, in the order the entry point uses.
   *
   * The application is deliberately not initialised before the adapter is set. Initialisation is when
   * the gateway builds its socket server, and it builds it with whatever adapter is installed at that
   * moment — so an adapter set afterwards is simply ignored, and the gateway quietly keeps the default
   * in-process one. That failure is invisible with a single instance, which is exactly the situation
   * this test exists to leave behind.
   */
  async function bootInstance(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();
    const app = moduleRef.createNestApplication();

    const adapter = new RedisIoAdapter(app, app.get<Redis>(REDIS_CLIENT));
    await adapter.connect();
    app.useWebSocketAdapter(adapter);

    // Binding a real port initialises the application, and the gateway needs a listening server for a
    // client to connect to.
    await app.listen(0);
    return app;
  }

  beforeAll(async () => {
    [alpha, beta] = [await bootInstance(), await bootInstance()];
    betaUrl = await beta.getUrl();
    hostToken = (await registerAndLogin(alpha, Role.HOST)).accessToken;
    guestToken = (await registerAndLogin(alpha, Role.GUEST)).accessToken;
  }, 30_000);

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await Promise.all([alpha.close(), beta.close()]);
  });

  it('delivers a change raised on one instance to a client connected to the other', async () => {
    // The listing is created through alpha; the client will watch it through beta.
    const listing = await request(alpha.getHttpServer())
      .post('/listings')
      .set({ Authorization: `Bearer ${hostToken}` })
      .send({
        title: 'Fan-out',
        city: 'Porto',
        nightlyPriceCents: 8100,
        maxGuests: 2,
      })
      .expect(201);
    const listingId = listing.body.id as string;

    const socket = io(`${betaUrl}/realtime`, { transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    await socket.emitWithAck('watch', listingId);

    const arrived = new Promise<ReservationChanged>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              'no event crossed between instances — the adapter is not fanning out through Redis',
            ),
          ),
        6000,
      );
      socket.once(RESERVATION_CHANGED, (event: ReservationChanged) => {
        clearTimeout(timer);
        resolve(event);
      });
    });

    // Raised on alpha. Nothing in alpha's process knows this socket exists.
    const held = await request(alpha.getHttpServer())
      .post('/reservations')
      .set({ Authorization: `Bearer ${guestToken}` })
      .send({
        listingId,
        checkIn: new Date(Date.now() + 4000 * DAY).toISOString(),
        checkOut: new Date(Date.now() + 4003 * DAY).toISOString(),
      })
      .expect(201);

    expect(await arrived).toMatchObject({
      type: RESERVATION_CHANGED,
      listingId,
      reservationId: held.body.id,
      status: 'HELD',
    });
  }, 20_000);
});
