import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { ReservationExpiryService } from './reservation-expiry.service';

/**
 * Booking bounded context — guests place, confirm, and cancel reservations and view their own; a
 * background sweep ({@link ReservationExpiryService}) reclaims abandoned holds.
 *
 * Depends on Identity only through the access token (`@Auth`/`@CurrentUser`) and on Listings only by
 * id, never by reaching into their tables.
 */
@Module({
  controllers: [BookingController],
  providers: [BookingService, ReservationExpiryService],
})
export class BookingModule {}
