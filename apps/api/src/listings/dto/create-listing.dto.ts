import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateListingDto {
  @ApiProperty({ example: 'Sunny loft near Alexanderplatz' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ example: 'Berlin' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  // Money is stored and validated as integer cents — `@IsInt` rejects floats, which avoids the
  // rounding errors that plague float money. 8900 = €89.00.
  @ApiProperty({
    example: 8900,
    description: 'Price per night in integer cents',
  })
  @IsInt()
  @Min(0)
  nightlyPriceCents!: number;

  @ApiProperty({ example: 4, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(64)
  maxGuests!: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Whether the listing is bookable.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
