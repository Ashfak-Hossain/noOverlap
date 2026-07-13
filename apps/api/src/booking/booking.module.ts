import { Module } from '@nestjs/common';
import { BookingController } from 'src/booking/booking.controller';
import { BookingService } from 'src/booking/booking.service';
import { ReservationExpiryService } from 'src/booking/reservation-expiry.service';
import { QueueModule } from 'src/queue/queue.module';
import { OutboxRelayService } from 'src/booking/outbox-relay.service';

/**
 * Booking bounded context — guests place, confirm, and cancel reservations and view their own; a
 * background sweep ({@link ReservationExpiryService}) reclaims abandoned holds.
 *
 * Depends on Identity only through the access token (`@Auth`/`@CurrentUser`) and on Listings only by
 * id, never by reaching into their tables.
 */
@Module({
  imports: [QueueModule],
  controllers: [BookingController],
  providers: [BookingService, ReservationExpiryService, OutboxRelayService],
})
export class BookingModule {}
