import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Realtime notifications.
 *
 * Exports the gateway so contexts that change a reservation can announce it. Nothing here decides
 * anything — the state change has already happened and been committed by the time this module is
 * asked to tell anyone about it.
 */
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
