import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  listingRoom,
  RESERVATION_CHANGED,
  type ReservationChanged,
  type ReservationStatusName,
} from '@no-overlap/contracts';
import type Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { REDIS_CLIENT } from 'src/redis/redis.provider';

/** Redis key holding the next sequence number for a listing. */
const seqKey = (listingId: string): string => `listing-seq:${listingId}`;

/**
 * How long a notification may take before it is abandoned.
 *
 * Short, because the caller is a committed booking waiting to answer its client. The exact value
 * matters far less than the existence of a bound.
 */
const PUBLISH_TIMEOUT_MS = 2_000;

/**
 * Rejects if the work has not finished in time.
 *
 * Needed because an unreachable Redis does not fail: the client queues commands while it is offline
 * and replays them on reconnect, so a command issued during an outage neither resolves nor rejects —
 * it waits, indefinitely. A caller that awaits one is not handling an error, it is hanging.
 */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Pushes reservation changes to clients watching a listing.
 *
 * Carries notifications, never the change itself: a client treats an event as a prompt to re-read,
 * not as data to trust. That is what allows delivery to be best-effort — these events are emitted
 * directly rather than through the outbox, because losing one costs a refresh, not a booking.
 *
 * Clients subscribe per listing rather than receiving everything, so a booking reaches the people
 * looking at that listing and nobody else.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Subscribes a socket to one listing's changes.
   *
   * Deliberately unauthenticated: this stream carries only that a listing's availability moved, which
   * is the same thing anyone can see by reading the public listing. Nothing guest-scoped travels over
   * it — a reservation id identifies the change, and reading it still requires being its owner.
   */
  @SubscribeMessage('watch')
  watch(
    @ConnectedSocket() client: Socket,
    @MessageBody() listingId: string,
  ): { watching: string } {
    void client.join(listingRoom(listingId));
    return { watching: listingId };
  }

  @SubscribeMessage('unwatch')
  unwatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() listingId: string,
  ): { watching: null } {
    void client.leave(listingRoom(listingId));
    return { watching: null };
  }

  /**
   * Announces that a reservation changed, to whoever is watching its listing.
   *
   * The sequence is allocated in Redis rather than in memory, because it has to keep increasing
   * across every API instance and across restarts — a per-process counter would repeat numbers and
   * make gaps undetectable, which is the one thing this design depends on.
   *
   * Failures are logged and swallowed. A booking has already been committed by the time this runs,
   * and refusing it because a notification could not be sent would trade something durable for
   * something disposable.
   *
   * Bounded by a timeout for the same reason, and it is the more important half: swallowing errors
   * only helps if there is an error. An unreachable Redis queues the command instead of rejecting it,
   * so without the bound this method would neither fail nor return, and the committed booking behind
   * it would never answer its client — the guest left watching a spinner while their dates are
   * genuinely held. A notification that cannot be sent is worth losing; the response is not.
   */
  async publishReservationChanged(
    listingId: string,
    reservationId: string,
    status: ReservationStatusName,
  ): Promise<void> {
    try {
      const seq = await withTimeout(
        this.redis.incr(seqKey(listingId)),
        PUBLISH_TIMEOUT_MS,
      );
      const event: ReservationChanged = {
        type: RESERVATION_CHANGED,
        version: 1,
        listingId,
        reservationId,
        status,
        seq,
      };
      this.server.to(listingRoom(listingId)).emit(RESERVATION_CHANGED, event);
    } catch (err) {
      this.logger.warn(
        `Could not publish a change for listing ${listingId}: ${String(err)}`,
      );
    }
  }
}
