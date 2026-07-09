import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@no-overlap/db';
import ms from 'ms';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';

/** Claims carried by the RS256 access token. Kept minimal — it is signed, not encrypted. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/** A freshly minted refresh token. The raw value leaves only in the cookie; only its hash persists. */
export interface IssuedRefresh {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Signs a short-lived access token. Algorithm (RS256) and TTL come from the JwtModule config. */
  signAccessToken(user: { id: string; role: Role }): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return this.jwt.signAsync(payload);
  }

  /**
   * Mints an opaque refresh token, stores only its hash, and returns the raw token for the cookie.
   *
   * A new `familyId` begins a rotation lineage (login); pass an existing one to continue a lineage
   * during rotation. Accepts an optional transaction client so a rotation can revoke the old token
   * and insert its successor atomically.
   */
  async issueRefreshToken(
    userId: string,
    familyId: string = randomUUID(),
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<IssuedRefresh> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtMs());

    await client.refreshToken.create({
      data: { userId, familyId, tokenHash: this.hashToken(token), expiresAt },
    });

    return { token, expiresAt };
  }

  /** The only representation of a refresh token ever stored or compared. */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Refresh lifetime in ms, parsed from `JWT_REFRESH_TTL` ('7d') for the cookie and DB expiry. */
  refreshTtMs(): number {
    // `@types/ms` types the string overload as the branded `StringValue`, not plain `string`; the
    // env value is a validated duration ('7d'), so assert the type rather than widen it.
    return ms(
      this.config.getOrThrow<string>('JWT_REFRESH_TTL') as ms.StringValue,
    );
  }
}
