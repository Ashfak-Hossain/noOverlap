import { ApiProperty } from '@nestjs/swagger';
import { AvailabilityKind } from '@no-overlap/db';

/** The public shape of an availability window on a listing. */
export class AvailabilityResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty({ format: 'date-time' })
  startsAt!: Date;

  @ApiProperty({ format: 'date-time' })
  endsAt!: Date;

  @ApiProperty({ enum: AvailabilityKind })
  kind!: AvailabilityKind;
}
