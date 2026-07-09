import { ApiProperty } from '@nestjs/swagger';

/** Login returns only the access token in the body; the refresh token is set as an HttpOnly cookie. */
export class LoginResponseDto {
  @ApiProperty({
    description:
      'Short-lived RS256 JWT. Send as `Authorization: Bearer <token>`.',
  })
  accessToken!: string;
}
