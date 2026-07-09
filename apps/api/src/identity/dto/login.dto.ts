import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'guest@example.com' })
  @IsEmail()
  email!: string;

  // Deliberately no length/strength rules: login must accept whatever was registered, and echoing
  // the password policy on a failed attempt would leak it. Strength is enforced only at registration.
  @ApiProperty({ example: 'correct-horse-battery-staple' })
  @IsString()
  password!: string;
}
