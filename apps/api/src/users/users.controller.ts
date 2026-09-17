import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { DeleteMeDto } from './dto/delete-me.dto.js';
import { GetMeResponseDto, RecordConsentResponseDto } from './dto/get-me-response.dto.js';
import { PublicUserDto } from './dto/public-user.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';

/** Every route here requires a valid access token via the global `JwtAuthGuard`
 * (`AuthModule`) — none of these routes is `@Public()`. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Profile, storage settings, notification settings, and monthly token usage' })
  @ApiOkResponse({ type: GetMeResponseDto })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<GetMeResponseDto> {
    return this.usersService.getMe(user.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update display name, retention policy, or notification settings' })
  @ApiOkResponse({ type: PublicUserDto })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto): Promise<PublicUserDto> {
    return this.usersService.updateMe(user.userId, dto);
  }

  @Post('consent')
  @ApiOperation({ summary: 'Record the recording-consent milestone' })
  @ApiOkResponse({ type: RecordConsentResponseDto })
  recordConsent(@CurrentUser() user: AuthenticatedUser): Promise<RecordConsentResponseDto> {
    return this.usersService.recordConsent(user.userId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete the account; hard delete follows after 30 days' })
  async deleteMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeleteMeDto): Promise<void> {
    await this.usersService.deleteMe(user.userId, dto.password);
  }
}
