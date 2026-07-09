import { SetMetadata } from '@nestjs/common';
import { Role } from '@no-overlap/db';

/** Metadata key under which `@Roles()` stores the allowed roles; read by {@link RolesGuard}. */
export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or controller) to the given roles. Pair with `JwtAuthGuard` so the caller is
 * authenticated first: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.HOST)`.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
