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
})
export class ListingsModule {}
