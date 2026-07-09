import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@no-overlap/db';

/**
 * Registration input. The global `ValidationPipe` enforces every rule here and reports failures
 * as the RFC 7807 envelope, not an ad-hoc 400. Each `@ApiProperty` also publishes the
 * field to the OpenAPI spec, so Swagger UI and the imported Postman collection show real examples.
 */
export class RegisterDto {
  @ApiProperty({ example: 'guest@example.com' })
  @IsEmail()
  email!: string;

  /**
   * Argon2 has no short input cap (unlike bcrypt's 72 bytes), so `maxLength` is not a correctness
   * limit — it bounds the work one request can force the hasher to do, closing a cheap DoS where an
   * attacker submits a megabyte-long password. `minLength` is the account-security floor.
   */
  @ApiProperty({
    example: 'correct-horse-battery-staple',
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  // Self-service model: a user chooses guest or host at sign-up (design.md §5). Any elevation
  // controls, if later needed, belong in RBAC (1.4), not in the registration contract.
  @ApiProperty({ enum: Role, example: Role.GUEST })
  @IsEnum(Role)
  role!: Role;
}
