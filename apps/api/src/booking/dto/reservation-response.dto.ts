import { ApiProperty } from '@nestjs/swagger';
import { ReservationStatus } from '@no-overlap/db';

/** The public shape of a reservation returned by the API. */
export class ReservationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) listingId!: string;
  @ApiProperty({ format: 'uuid' }) guestId!: string;
  @ApiProperty() checkIn!: Date;
  @ApiProperty() checkOut!: Date;
  @ApiProperty({ enum: ReservationStatus }) status!: ReservationStatus;
  @ApiProperty() priceTotalCents!: number;
  @ApiProperty() holdExpiresAt!: Date;
  @ApiProperty() createdAt!: Date;
}
