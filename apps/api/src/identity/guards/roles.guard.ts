import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@no-overlap/db';
import { AppException } from '../../common/errors/app.exception';
import { AuthUser } from '../types/jwt-payload';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Authorizes a request by role. Reads the roles required by `@Roles()` (a method-level decorator
 * overrides a class-level one) and checks them against the authenticated `req.user.role`. A route
 * with no `@Roles()` is unrestricted by this guard — authentication alone (JwtAuthGuard) governs it.
 *
 * Must run AFTER JwtAuthGuard so `req.user` exists: list it second in
 * `@UseGuards(JwtAuthGuard, RolesGuard)`. Denies with 403 FORBIDDEN (authenticated but not
 * permitted) — distinct from the 401 an unauthenticated caller gets.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) {
      throw new AppException('UNAUTHENTICATED');
    }
    if (!required.includes(user.role)) {
      throw new AppException('FORBIDDEN');
    }
    return true;
  }
}
