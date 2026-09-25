import { Module } from '@nestjs/common';
import { ExpoPushClient } from './expo-push.client.js';
import { MeetingReadyNotifier } from './meeting-ready.notifier.js';
import { PushTokensController } from './push-tokens.controller.js';

@Module({
  controllers: [PushTokensController],
  providers: [ExpoPushClient, MeetingReadyNotifier],
  exports: [MeetingReadyNotifier],
})
export class NotificationsModule {}
