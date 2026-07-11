import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId!: string;

  // ISO 8601. The half-open interval [checkIn, checkOut) — checkout == next check-in is NOT an
  // overlap. Cross-field rule (checkOut > checkIn) is enforced in the service, not
  // here, because class-validator can't compare two fields cleanly.
  @ApiProperty({ example: '2026-08-01T15:00:00.000Z' })
  @IsDateString()
  checkIn!: string;

  @ApiProperty({ example: '2026-08-05T11:00:00.000Z' })
  @IsDateString()
  checkOut!: string;
}
