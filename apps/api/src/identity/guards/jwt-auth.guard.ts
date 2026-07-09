import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../common/errors/app.exception';
import { AuthUser } from '../types/jwt-payload';

/**
 * Closes a route unless a valid access token is present.
 *
 * Passport's default failure is a bare `UnauthorizedException`; translating it to `UNAUTHENTICATED`
 * makes a missing/invalid/expired token come back as the ADR-0009 problem+json, identical in shape
 * to every other error the API returns.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthUser>(err: unknown, user: unknown): TUser {
    if (err || !user) {
      throw new AppException('UNAUTHENTICATED');
    }
    return user as TUser;
  }
}
