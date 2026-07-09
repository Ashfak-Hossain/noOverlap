import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, JwtPayload } from '../types/jwt-payload';

/**
 * Verifies the Bearer access token on protected routes.
 *
 * RS256 is asymmetric, so verification uses only the PUBLIC key — the signing key never touches this
 * path. `algorithms: ['RS256']` is a hard allow-list that blocks algorithm-confusion attacks (a
 * forged `alg: none`, or `HS256` abusing the public key as an HMAC secret). By the time `validate`
 * runs, passport-jwt has already checked the signature and expiry.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: Buffer.from(
        config.getOrThrow<string>('JWT_PUBLIC_KEY_B64'),
        'base64',
      ).toString('utf8'),
      algorithms: ['RS256'],
    });
  }

  /** Whatever this returns becomes `req.user`; we surface a minimal principal, not the raw claims. */
  validate(payload: JwtPayload): AuthUser {
    return { userId: payload.sub, role: payload.role };
  }
}
