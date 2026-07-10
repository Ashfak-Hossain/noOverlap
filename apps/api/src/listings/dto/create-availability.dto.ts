import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum } from 'class-validator';
import { AvailabilityKind } from '@no-overlap/db';

export class CreateAvailabilityDto {
  @ApiProperty({ format: 'date-time', example: '2026-08-01T14:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-10T11:00:00.000Z' })
  @IsDateString()
  endsAt!: string;

  @ApiProperty({ enum: AvailabilityKind, example: AvailabilityKind.OPEN })
  @IsEnum(AvailabilityKind)
  kind!: AvailabilityKind;
}
