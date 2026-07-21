import { Module } from '@nestjs/common';
import { BookingController } from 'src/booking/booking.controller';
import { BookingService } from 'src/booking/booking.service';
import { ReservationExpiryService } from 'src/booking/reservation-expiry.service';
import { ReservationCompletionService } from 'src/booking/reservation-completion.service';
import { ListingsModule } from 'src/listings/listings.module';
import { QueueModule } from 'src/queue/queue.module';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { OutboxRelayService } from 'src/booking/outbox-relay.service';
import { PaymentResultProcessor } from 'src/booking/payment-result.processor';

/**
 * Booking bounded context — guests place and cancel reservations and view their own; confirmation is
 * driven by payment results flowing back through the saga ({@link PaymentResultProcessor}), and two
 * background sweeps retire reservations nobody will act on again: {@link ReservationExpiryService}
 * reclaims holds that were never paid for, {@link ReservationCompletionService} finishes stays that
 * were.
 *
 * Depends on Identity only through the access token (`@Auth`/`@CurrentUser`) and on Listings only by
 * id, never by reaching into their tables.
 */
@Module({
  imports: [QueueModule, ListingsModule, RealtimeModule],
  controllers: [BookingController],
  providers: [
    BookingService,
    ReservationExpiryService,
    ReservationCompletionService,
    OutboxRelayService,
    PaymentResultProcessor,
  ],
  // Exported so Reviews can ask whether a reservation is the caller's and whether the stay has ended,
  // instead of reading the reservations tables itself.
  exports: [BookingService],
})
export class BookingModule {}
