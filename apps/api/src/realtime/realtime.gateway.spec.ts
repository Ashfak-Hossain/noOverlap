import type Redis from 'ioredis';
import type { Server } from 'socket.io';
import { RealtimeGateway } from './realtime.gateway';

/**
 * A gateway wired to a stand-in Redis and a socket server that records what it was asked to emit.
 *
 * The recorder is handed back alongside the gateway rather than read off it afterwards, because the
 * real `server` is private — reaching into it from a test would mean describing the class as
 * something it is not.
 */
function gatewayWith(redis: Partial<Redis>): {
  gateway: RealtimeGateway;
  emitted: [string, unknown][];
} {
  const emitted: [string, unknown][] = [];
  const server = {
    to: () => ({
      emit: (name: string, payload: unknown) => {
        emitted.push([name, payload]);
      },
    }),
  } as unknown as Server;

  const gateway = new RealtimeGateway(redis as Redis);
  // Normally injected by the framework when the gateway initialises.
  Object.defineProperty(gateway, 'server', { value: server, writable: true });

  return { gateway, emitted };
}

/**
 * The gateway's guarantee to its callers: announcing a change never holds up the thing that changed.
 *
 * A reservation is already committed by the time it is announced, so anything that lets this method
 * hang turns a durable booking into a request that never answers its client.
 */
describe('RealtimeGateway.publishReservationChanged', () => {
  it('emits the change with the sequence Redis allocated', async () => {
    const { gateway, emitted } = gatewayWith({
      incr: () => Promise.resolve(7),
    });

    await gateway.publishReservationChanged('listing-1', 'res-1', 'HELD');

    expect(emitted).toHaveLength(1);
    const [name, payload] = emitted[0];
    expect(name).toBe('reservation.changed');
    expect(payload).toMatchObject({
      listingId: 'listing-1',
      reservationId: 'res-1',
      status: 'HELD',
      seq: 7,
    });
  });

  it('gives up rather than hanging when Redis never answers', async () => {
    // An unreachable Redis does not reject. The client queues the command and replays it whenever it
    // reconnects, which may be never — so this is what an outage actually looks like to a caller.
    const { gateway, emitted } = gatewayWith({
      incr: () => new Promise<number>(() => {}),
    });

    // Resolving at all is the assertion. Without a bound on the wait, this test does not fail with a
    // wrong value; it never finishes, and neither would the booking that called it.
    await expect(
      gateway.publishReservationChanged('listing-1', 'res-1', 'HELD'),
    ).resolves.toBeUndefined();
    expect(emitted).toEqual([]);
  }, 10_000);

  it('swallows an outright failure, because the booking is already committed', async () => {
    const { gateway, emitted } = gatewayWith({
      incr: () => Promise.reject(new Error('connection lost')),
    });

    await expect(
      gateway.publishReservationChanged('listing-1', 'res-1', 'CONFIRMED'),
    ).resolves.toBeUndefined();
    expect(emitted).toEqual([]);
  });
});
