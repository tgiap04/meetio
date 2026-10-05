import { Module } from '@nestjs/common';
import { MeetingRoomNotifier } from './meeting-room.notifier.js';

/**
 * The notifier on its own, so a feature that only pushes events (translation)
 * need not import `RealtimeModule` — which itself needs that feature to hook
 * ingestion, and Nest modules cannot import each other in a circle. The one
 * instance is shared: the gateway attaches its namespace to it at start-up.
 */
@Module({ providers: [MeetingRoomNotifier], exports: [MeetingRoomNotifier] })
export class MeetingRoomNotifierModule {}
