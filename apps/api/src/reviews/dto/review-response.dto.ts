import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The public shape of a review returned by the API. */
export class ReviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  rating!: number;

  @ApiPropertyOptional({ nullable: true })
  body!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
