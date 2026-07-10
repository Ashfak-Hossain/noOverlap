import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './tokens.service';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Identity — users, authentication, and role-based access.
 *
 * `JwtModule` is configured for RS256 from env: the base64-PEM keys (ADR-0011) are decoded here, the
 * private key signs and the public key verifies. `ConfigService`/`PrismaService` are injected without
 * imports because their modules are global.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        privateKey: Buffer.from(
          config.getOrThrow<string>('JWT_PRIVATE_KEY_B64'),
          'base64',
        ).toString('utf8'),
        publicKey: Buffer.from(
          config.getOrThrow<string>('JWT_PUBLIC_KEY_B64'),
          'base64',
        ).toString('utf8'),
        signOptions: {
          algorithm: 'RS256',
          // ConfigService widens the value to `string`; jsonwebtoken wants ms's branded StringValue.
          // The value is a validated duration ('15m'), so assert the JWT option type here.
          expiresIn: config.getOrThrow<string>(
            'JWT_ACCESS_TTL',
          ) as JwtSignOptions['expiresIn'],
        },
        verifyOptions: { algorithms: ['RS256'] },
      }),
    }),
    PassportModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy],
})
export class IdentityModule {}
