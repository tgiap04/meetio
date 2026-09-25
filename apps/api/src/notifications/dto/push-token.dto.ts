import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';
import type { RegisterPushTokenRequest, UnregisterPushTokenRequest } from '@meetio/shared';

// Expo push tokens look like `ExponentPushToken[xxxxxxxx]` (older: `ExpoPushToken[...]`).
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/;

export class RegisterPushTokenDto implements RegisterPushTokenRequest {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @Matches(EXPO_TOKEN)
  token!: string;

  @ApiProperty({ enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}

export class UnregisterPushTokenDto implements UnregisterPushTokenRequest {
  @ApiProperty()
  @IsString()
  @Matches(EXPO_TOKEN)
  token!: string;
}
