import { Module } from '@nestjs/common';
import { BookingModule } from 'src/booking/booking.module';
import {
  ListingReviewsController,
  ReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

/**
 * Reviews bounded context — a guest's verdict on a stay they actually took.
 *
 * Depends on Booking only through its exported service, to ask whether a reservation belongs to the
 * caller and whether the stay has ended. It never reads the reservations tables itself.
 */
@Module({
  imports: [BookingModule],
  controllers: [ReviewsController, ListingReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
