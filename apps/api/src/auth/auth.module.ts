import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { User, RefreshToken } from '../database/entities/index.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthService } from './google-auth.service.js';
import { GoogleTokenVerifier } from './google-token-verifier.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './jwt.strategy.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * `JwtAuthGuard` is registered as the global `APP_GUARD` here so every
 * future module (meetings, transcripts, ...) is authenticated by default
 * with zero per-controller wiring — opting out requires the explicit
 * `@Public()` decorator, which is the safer default direction.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_ACCESS_SECRET');
        if (!secret) {
          throw new Error('JWT_ACCESS_SECRET is required');
        }
        return { secret };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleAuthService,
    GoogleTokenVerifier,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  // Only `GoogleTokenVerifier` is exported to other modules (UsersModule,
  // for the phase-12 account-deletion step-up check) — never
  // `GoogleAuthService`, which depends on `UsersModule`'s own repositories
  // and would otherwise create a module import cycle (file-ownership.md
  // §Rủi ro).
  exports: [AuthService, GoogleTokenVerifier],
})
export class AuthModule {}
