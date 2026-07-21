import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions, Server } from 'socket.io';

/**
 * Fans socket emissions out across every API instance.
 *
 * A gateway only knows the sockets connected to its own process. With more than one instance behind a
 * load balancer, a booking handled by one would be invisible to everyone connected to another — the
 * feature would appear to work in development and quietly half-fail in production.
 *
 * This adapter publishes every emit onto Redis, which all instances subscribe to, so a broadcast
 * reaches sockets wherever they happen to be connected.
 *
 * Two connections are required, not one: a Redis client in subscriber mode may issue no other
 * commands, so publishing needs a separate connection. They are duplicated from the shared client so
 * they inherit its configuration.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redis: Redis,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    // `lazyConnect` is overridden because a duplicate otherwise inherits the shared client's eager
    // connect and is already connecting by the time it is returned, which makes the explicit connect
    // below throw. Connecting on demand keeps that await meaningful: it resolves once both clients are
    // actually ready, so the adapter is in place before the first socket arrives.
    const pubClient = this.redis.duplicate({ lazyConnect: true });
    const subClient = this.redis.duplicate({ lazyConnect: true });
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
