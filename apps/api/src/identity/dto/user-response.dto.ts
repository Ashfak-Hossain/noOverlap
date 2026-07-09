import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@no-overlap/db';

/**
 * The safe public projection of a user. It deliberately omits `passwordHash` — the hash must never
 * cross the service boundary, so the shape that leaves the API cannot carry it by construction.
 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'guest@example.com' })
  email!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
