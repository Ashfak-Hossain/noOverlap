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
   */
  async publishReservationChanged(
    listingId: string,
    reservationId: string,
    status: ReservationStatusName,
  ): Promise<void> {
    try {
      const seq = await this.redis.incr(seqKey(listingId));
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
