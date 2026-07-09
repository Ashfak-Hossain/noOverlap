import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { hash } from '@node-rs/argon2';
import { Prisma } from '@no-overlap/db';
import { AppException } from 'src/common/errors/app.exception';
import { Injectable } from '@nestjs/common';

/** Postgres unique-violation code surfaced by Prisma; here it means the email is already taken. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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
}
