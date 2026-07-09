import { RolesGuard } from './guards/roles.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { IssuedRefresh } from './tokens.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './types/jwt-payload';
import { MeResponseDto } from './dto/me-response.dto';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@no-overlap/db';
import { Roles } from './decorators/roles.decorator';

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
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5/min per IP — throttle mass account creation
  // Nest already maps POST to 201, but stating it makes the created-resource contract explicit
  // at the route and keeps it stable if the default ever changes.
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({
    description: 'Email already registered (RFC 7807 problem+json).',
  })
  register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5/min per IP — brute-force / stuffing defense
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials (RFC 7807 problem+json).',
  })
  async login(
    @Body() dto: LoginDto,
    // passthrough: set the refresh cookie on the response while still returning the DTO through
    // Nest's normal serialization (and keeping the global exception filter in play).
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const { accessToken, refresh } = await this.authService.login(dto);
    this.setRefreshCookie(res, refresh);
    return { accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token and issue a new access token',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired, invalid, or replayed refresh token.',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    // The refresh token is never in the body — it comes from the HttpOnly cookie (via cookie-parser).
    const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const { accessToken, refresh } = await this.authService.refresh(rawToken);
    this.setRefreshCookie(res, refresh);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke the refresh-token family and clear the cookie',
  })
  @ApiNoContentResponse({ description: 'Logged out (idempotent).' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.authService.logout(rawToken);
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }

  /**
   * Sets the refresh token as an HttpOnly, path-scoped cookie: script (hence XSS) cannot read it,
   * `secure` makes it HTTPS-only outside dev, and SameSite=lax blunts CSRF. Shared by login and
   * refresh so the attributes are defined once. (ADR-0011)
   */
  private setRefreshCookie(res: Response, refresh: IssuedRefresh): void {
    res.cookie(REFRESH_COOKIE, refresh.token, {
      httpOnly: true,
      secure: this.config.getOrThrow<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/auth',
      expires: refresh.expiresAt,
    });
  }

  /**
   * The authenticated caller, decoded from the access token. First protected route: `JwtAuthGuard`
   * verifies the token and populates `req.user`; `@CurrentUser` surfaces it here.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user' })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  me(@CurrentUser() user: AuthUser): MeResponseDto {
    return user;
  }

  @Get('host-only')
  @UseGuards(JwtAuthGuard, RolesGuard) // authenticate first, then authorize by role
  @Roles(Role.HOST)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[demo] Host-only route (RBAC proof)' })
  @ApiOkResponse({ description: 'Caller has the HOST role.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'Authenticated but not a HOST.' })
  hostOnly(@CurrentUser() user: AuthUser): { ok: true; userId: string } {
    return { ok: true, userId: user.userId };
  }
}
