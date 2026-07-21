import { Module } from '@nestjs/common';
import { BookingController } from 'src/booking/booking.controller';
import { BookingService } from 'src/booking/booking.service';
import { ReservationExpiryService } from 'src/booking/reservation-expiry.service';
import { QueueModule } from 'src/queue/queue.module';
import { OutboxRelayService } from 'src/booking/outbox-relay.service';
import { PaymentResultProcessor } from 'src/booking/payment-result.processor';

/**
 * Booking bounded context — guests place and cancel reservations and view their own; confirmation is
 * driven by payment results flowing back through the saga ({@link PaymentResultProcessor}), and a
 * background sweep ({@link ReservationExpiryService}) reclaims abandoned holds.
 *
 * Depends on Identity only through the access token (`@Auth`/`@CurrentUser`) and on Listings only by
 * id, never by reaching into their tables.
 */
@Module({
  imports: [QueueModule],
  controllers: [BookingController],
  providers: [
    BookingService,
    ReservationExpiryService,
    OutboxRelayService,
    PaymentResultProcessor,
  ],
})
export class BookingModule {}
