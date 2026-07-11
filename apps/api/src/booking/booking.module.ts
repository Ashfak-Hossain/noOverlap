import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

/**
 * Booking bounded context — guests place holds on date ranges and view their own reservations.
 *
 * Depends on Identity only through the access token (`@Auth`/`@CurrentUser`) and on Listings only by
 * id, never by reaching into their tables — the module-boundary rule from design.md §3.
 *
 * @remarks The controller and service are currently registered in `AppModule`; this module is their
 * home as the context grows its own providers.
 */
@Module({
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
