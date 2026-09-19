import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { GoogleAuthService } from './google-auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { GoogleSignInDto } from './dto/google-sign-in.dto.js';
import { AuthTokenPairDto, RefreshTokenResponseDto } from './dto/auth-token-pair.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from './jwt-payload.type.js';

/**
 * `/auth/*` — 10 requests/min/IP (api-spec §10). `ThrottlerGuard` here (not
 * global) keeps the limit scoped to this controller; every other route
 * keeps the module-wide default set in `AuthModule`.
 */
@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  @ApiOkResponse({ type: AuthTokenPairDto })
  register(@Body() dto: RegisterDto): Promise<AuthTokenPairDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: AuthTokenPairDto })
  login(@Body() dto: LoginDto): Promise<AuthTokenPairDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token for a new access/refresh pair' })
  @ApiOkResponse({ type: RefreshTokenResponseDto })
  refresh(@Body() dto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    return this.authService.refresh(dto.refresh_token);
  }

  /** No `@Throttle` here — inherits the class-level 10/min/IP limit
   * (api-spec §10; asserted in auth.controller.spec.ts, not just assumed). */
  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in or register with a verified Google ID token' })
  @ApiOkResponse({ type: AuthTokenPairDto })
  googleSignIn(@Body() dto: GoogleSignInDto): Promise<AuthTokenPairDto> {
    return this.googleAuthService.signIn(dto.id_token);
  }

  /** No `@Public()` — requires a valid access token so we know whose (and
   * which) refresh token to revoke; see `AuthService.logout`. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh token bound to the current session' })
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user.userId, user.jti);
  }
}
