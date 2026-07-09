import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/jwt-payload';

/**
 * Injects the authenticated principal set by {@link JwtStrategy.validate}. Use only on routes behind
 * `JwtAuthGuard`; on an unguarded route `req.user` is undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
  },
);
