import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

/**
 * Listings bounded context — hosts manage properties.
 *
 * Depends on Identity only through the access token (`@Auth`/`@CurrentUser`), never by reaching into
 * its tables — the module-boundary rule.
 */
@Module({
  controllers: [ListingsController],
  providers: [ListingsService],
  // Exported as this context's published surface. Booking needs to know which listings a host owns
  // in order to answer "which bookings are mine?", and asking this service is how it does that —
  // never by querying the listings tables itself.
  exports: [ListingsService],
})
export class ListingsModule {}
