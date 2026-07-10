import { ApiProperty } from '@nestjs/swagger';

/** The public shape of a listing returned by the API. */
export class ListingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  hostId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  nightlyPriceCents!: number;

  @ApiProperty()
  maxGuests!: number;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
