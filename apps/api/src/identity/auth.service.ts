import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { hash, verify } from '@node-rs/argon2';
import { Prisma } from '@no-overlap/db';
import { AppException } from 'src/common/errors/app.exception';
import { Injectable } from '@nestjs/common';
import { IssuedRefresh, TokenService } from './tokens.service';
import { LoginDto } from './dto/login.dto';

/** Postgres unique-violation code surfaced by Prisma; here it means the email is already taken. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class AuthService {
  /**
   * A valid Argon2 hash that no real password matches, computed once. Login verifies against it when
   * the email is unknown, so unknown-email and wrong-password take the same time — response latency
   * can't be used to enumerate which emails are registered.
   */
  private readonly dummyHash = hash(
    'argon2-timing-equalizer-not-a-real-secret',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Registers a new user with an Argon2id-hashed password.
   *
   * Uniqueness is enforced by the `users.email` UNIQUE constraint, not a prior existence check:
   * we attempt the insert and translate the violation. This is the same database-as-arbiter
   * pattern as the reservation exclusion constraint — it is race-free, whereas
   * check-then-insert lets two concurrent sign-ups both pass the check and both insert.
   *
   * @returns the created user without its password hash — the hash never leaves this method.
   * @throws AppException `EMAIL_ALREADY_EXISTS` (409) when the email is already registered.
   */
  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const passwordHash = await hash(dto.password);

    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role: dto.role,
        },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_VIOLATION
      ) {
        throw new AppException('EMAIL_ALREADY_EXISTS');
      }
      throw error; // unexpected: generic 500
    }
  }

  /**
   * Verifies credentials, then issues an access token plus a new refresh-token lineage.
   *
   * Runs an Argon2 verify in every path — against {@link dummyHash} when the email is unknown — and
   * returns the same `INVALID_CREDENTIALS` for a missing user and a wrong password, so neither the
   * error nor the response timing reveals whether an email is registered.
   *
   * @throws AppException `INVALID_CREDENTIALS` (401) on any authentication failure.
   */
  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refresh: IssuedRefresh }> {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
      select: {
        id: true,
        role: true,
        passwordHash: true,
      },
    });

    const passwordOke = await verify(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );
    if (!user || !passwordOke) {
      throw new AppException('INVALID_CREDENTIALS');
    }

    const accessToken = await this.tokens.signAccessToken(user);
    const refresh = await this.tokens.issueRefreshToken(user.id);
    return { accessToken, refresh };
  }

  /**
   * Rotates a refresh token: revokes the presented one and issues a successor in the same family,
   * plus a fresh access token.
   *
   * Reuse detection is the point: a token presented *after* it was already revoked is a replay — the
   * fingerprint of theft, since the legitimate client always holds the newest token. In that case the
   * entire family is revoked, forcing re-authentication. This detection is only possible because
   * refresh tokens are persisted; a stateless token could not be revoked.
   *
   * @throws AppException `UNAUTHENTICATED` (401) when the token is missing, unknown, expired, or replayed.
   */
  async refresh(
    rawToken: string | undefined,
  ): Promise<{ accessToken: string; refresh: IssuedRefresh }> {
    if (!rawToken) throw new AppException('UNAUTHENTICATED');

    const presented = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash: this.tokens.hashToken(rawToken),
      },
    });
    if (!presented) {
      throw new AppException('UNAUTHENTICATED');
    }

    // Replay of an already-rotated token: revoke every still-live token in the family.
    if (presented.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: {
          familyId: presented.familyId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      throw new AppException('UNAUTHENTICATED');
    }

    if (presented.expiresAt <= new Date()) {
      throw new AppException('UNAUTHENTICATED');
    }

    // Role is read fresh (it may have changed since issue); also covers a since-deleted user.
    const user = await this.prisma.user.findUnique({
      where: {
        id: presented.userId,
      },
      select: {
        id: true,
        role: true,
      },
    });
    if (!user) {
      throw new AppException('UNAUTHENTICATED');
    }

    // Rotate atomically — a crash can never leave two live tokens (or none) for one lineage.
    const refresh = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: {
          id: presented.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      return this.tokens.issueRefreshToken(user.id, presented.familyId, tx);
    });

    const accessToken = await this.tokens.signAccessToken(user);
    return { accessToken, refresh };
  }

  /**
   * Revokes the presented token's entire family, ending that login session (all rotated descendants).
   * Idempotent: an absent or unknown token is a no-op.
   */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }

    const presented = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash: this.tokens.hashToken(rawToken),
      },
    });
    if (!presented) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        familyId: presented.familyId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
