import { ApiProperty } from '@nestjs/swagger';
import { ReviewResponseDto } from './review-response.dto';

/** A listing's reviews together with the summary a rating display needs. */
export class ListingReviewsDto {
  // Null, not zero, when a listing has no reviews. Zero is a real rating a listing can earn, so
  // reporting it for "nobody has said anything yet" would state something untrue — and would sort an
  // unreviewed listing below a badly-reviewed one.
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Mean rating, or null when the listing has no reviews.',
    example: 4.6,
  })
  averageRating!: number | null;

  @ApiProperty({ example: 12 })
  count!: number;

  @ApiProperty({ type: ReviewResponseDto, isArray: true })
  reviews!: ReviewResponseDto[];
}
