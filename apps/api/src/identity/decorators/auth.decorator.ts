import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@no-overlap/db';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/**
 * Composite auth decorator. Bundles authentication (JwtAuthGuard), role authorization (RolesGuard +
 * `@Roles`), and the Swagger bearer marker so a protected route states its intent in one line.
 * `@Auth()` = any authenticated user; `@Auth(Role.HOST)` = host-only.
 */
export function Auth(...roles: Role[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(...roles),
    ApiBearerAuth(),
  );
}
