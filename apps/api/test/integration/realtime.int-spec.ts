import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@no-overlap/db';
import {
  RESERVATION_CHANGED,
  type ReservationChanged,
} from '@no-overlap/contracts';
import { io, type Socket } from 'socket.io-client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ReservationExpiryService } from '../../src/booking/reservation-expiry.service';
import { createTestApp, registerAndLogin } from './helpers';

const DAY = 86_400_000;

/** Resolves with the next matching event, or rejects if none arrives in time. */
function nextEvent(
  socket: Socket,
  timeoutMs = 4000,
): Promise<ReservationChanged> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('no realtime event arrived')),
      timeoutMs,
    );
    socket.once(RESERVATION_CHANGED, (event: ReservationChanged) => {
      clearTimeout(timer);
      resolve(event);
    });
  });
}

/**
 * The realtime gateway against a real server and a real socket client.
 *
 * Asserted over an actual connection rather than by calling the gateway directly, because the things
 * worth proving — that a room scopes delivery, and that sequence numbers let a client notice a gap —
 * only exist once a socket is involved.
 */
describe('Realtime — reservation changes (e2e)', () => {
  let app: INestApplication;
  let url: string;
  let hostToken: string;
  let guestToken: string;
  let sockets: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    // A real port: the gateway needs a listening server for a client to connect to.
    await app.listen(0);
    url = await app.getUrl();
    hostToken = (await registerAndLogin(app, Role.HOST)).accessToken;
    guestToken = (await registerAndLogin(app, Role.GUEST)).accessToken;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await app.close();
  });

  afterEach(() => {
    for (const socket of sockets) socket.close();
    sockets = [];
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let seq = 0;
  const futureRange = () => {
    const base = 1500 + seq++ * 10;
    return {
      checkIn: new Date(Date.now() + base * DAY).toISOString(),
      checkOut: new Date(Date.now() + (base + 2) * DAY).toISOString(),
    };
  };

  async function freshListing(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/listings')
      .set(auth(hostToken))
      .send({
        title: 'RT',
        city: 'Oslo',
        nightlyPriceCents: 9000,
        maxGuests: 2,
      })
      .expect(201);
    return res.body.id as string;
  }

  /** Connects a client and waits until it has joined the listing's room. */
  async function watch(listingId: string): Promise<Socket> {
    const socket = io(`${url}/realtime`, { transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    await socket.emitWithAck('watch', listingId);
    return socket;
  }

  it('pushes a change to a client watching that listing', async () => {
    const listingId = await freshListing();
    const socket = await watch(listingId);
    const arrived = nextEvent(socket);

    const held = await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(guestToken))
      .send({ listingId, ...futureRange() })
      .expect(201);

    const event = await arrived;
    expect(event).toMatchObject({
      type: RESERVATION_CHANGED,
      listingId,
      reservationId: held.body.id,
      status: 'HELD',
    });
  });

  it('does not push a listing’s changes to clients watching a different one', async () => {
    const [watched, other] = [await freshListing(), await freshListing()];
    const socket = await watch(watched);

    const heard: ReservationChanged[] = [];
    socket.on(RESERVATION_CHANGED, (e: ReservationChanged) => heard.push(e));

    // A booking on the listing this client is NOT watching.
    await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(guestToken))
      .send({ listingId: other, ...futureRange() })
      .expect(201);

    await new Promise((r) => setTimeout(r, 600));
    expect(heard).toEqual([]);
  });

  it('numbers events per listing so a client can detect a gap', async () => {
    const listingId = await freshListing();
    const socket = await watch(listingId);

    const seen: number[] = [];
    socket.on(RESERVATION_CHANGED, (e: ReservationChanged) => seen.push(e.seq));

    const first = await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(guestToken))
      .send({ listingId, ...futureRange() })
      .expect(201);
    // Cancelling is a second change to the same listing, so it must carry the next number.
    await request(app.getHttpServer())
      .post(`/reservations/${first.body.id}/cancel`)
      .set(auth(guestToken))
      .expect(200);

    await new Promise((r) => setTimeout(r, 800));
    expect(seen.length).toBeGreaterThanOrEqual(2);
    // Strictly increasing is the whole point: a client comparing against its last seen value can tell
    // it missed something. Equal or unordered numbers would make a gap invisible.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    }
  });

  it('announces an expiry swept in the background', async () => {
    const listingId = await freshListing();
    const socket = await watch(listingId);

    const held = await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(guestToken))
      .send({ listingId, ...futureRange() })
      .expect(201);

    // Backdate the hold, then drive the sweep directly rather than waiting on its timer.
    const db = app.get(PrismaService, { strict: false });
    await db.reservation.update({
      where: { id: held.body.id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });

    const arrived = nextEvent(socket);
    await app
      .get(ReservationExpiryService, { strict: false })
      .sweepExpiredHolds();

    const event = await arrived;
    expect(event).toMatchObject({
      reservationId: held.body.id,
      status: 'EXPIRED',
    });
  });
});
