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
}
