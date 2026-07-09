import { Role } from '@no-overlap/db';

/**
 * The access-token claims we sign, plus the standard timestamps jsonwebtoken adds on signing. Kept
 * minimal on purpose: the token is signed, not encrypted, so it must carry nothing secret.
 */
export interface JwtPayload {
  sub: string; // user id
  role: Role;
  iat: number;
  exp: number;
}

/** The authenticated principal the JWT strategy attaches to the request (becomes `req.user`). */
export interface AuthUser {
  userId: string;
  role: Role;
}
