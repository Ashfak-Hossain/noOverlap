import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@no-overlap/db';

/** The authenticated caller's identity, decoded from the access token. */
export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: Role })
  role!: Role;
}
