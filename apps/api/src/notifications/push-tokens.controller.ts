import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DataSource } from 'typeorm';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { RegisterPushTokenDto, UnregisterPushTokenDto } from './dto/push-token.dto.js';

/** api-spec §2 — this device's Expo push token. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me/push-tokens')
export class PushTokensController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register (or refresh) this device for push. A token moves to whoever registered it last' })
  @ApiNoContentResponse()
  async register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterPushTokenDto): Promise<void> {
    // One token = one device. If another account signed in on this phone
    // before, the device now belongs to this one — it must not keep receiving
    // the previous account's notifications.
    await this.dataSource.query(
      `INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`,
      [user.userId, dto.token, dto.platform],
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop pushing to this device (logout, or notifications turned off)' })
  @ApiNoContentResponse()
  async unregister(@CurrentUser() user: AuthenticatedUser, @Body() dto: UnregisterPushTokenDto): Promise<void> {
    // Scoped to the caller: nobody can unsubscribe someone else's device.
    await this.dataSource.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [dto.token, user.userId]);
  }
}
