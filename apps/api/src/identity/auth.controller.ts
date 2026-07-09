import {
  Body,
  Controller,
  HttpCode,
  Post,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { LoginResponseDto } from './dto/login-response.dto';

/** Cookie carrying the refresh token. Path-scoped to /auth so it rides only on refresh/logout. */
const REFRESH_COOKIE = 'refresh_token';

/**
 * HTTP boundary for the identity module's authentication surface.
 *
 * Handlers here are thin: they carry no business logic and delegate to {@link AuthService}.
 * Request bodies are validated upstream by the global `ValidationPipe` against the DTOs, and any
 * domain error the service raises is rendered as the RFC 7807 envelope by the global exception
 * filter — so this layer neither validates nor formats errors itself.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registers a new user and returns the safe {@link UserResponseDto} projection.
   *
   * Delegates to {@link AuthService.register}; a duplicate email surfaces there as
   * `EMAIL_ALREADY_EXISTS` and reaches the client as the 409 documented below.
   */
  @Post('register')
  // Nest already maps POST to 201, but stating it makes the created-resource contract explicit
  // at the route and keeps it stable if the default ever changes.
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user ' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({
    description: 'Email already registered (RFC 7807 problem + json).',
  })
  register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials (RFC 7807 problem+json).',
  })
  async login(
    @Body() dto: LoginDto,
    // passthrough: we set a cookie on the response but still return the DTO through Nest's normal
    // serialization (and keep the global exception filter in play).
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refresh } = await this.authService.login(dto);

    // The refresh token lives ONLY in this HttpOnly cookie: script (hence XSS) cannot read it. It is
    // path-scoped to /auth so it never rides along on ordinary API calls; `secure` makes it
    // HTTPS-only outside dev; SameSite=lax blunts CSRF.

    res.cookie(REFRESH_COOKIE, refresh.token, {
      httpOnly: true,
      secure: this.config.getOrThrow<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/auth',
      expires: refresh.expiresAt,
    });

    return { accessToken };
  }
}
