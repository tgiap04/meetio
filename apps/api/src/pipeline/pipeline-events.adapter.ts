import { Injectable, Logger } from '@nestjs/common';
import { errorCode } from '../common/logging/log-error.js';
import type { ProcessingStatusPayload } from '@meetio/shared';
import { MeetingRoomNotifier } from '../realtime/meeting-room.notifier.js';
import { MeetingReadyNotifier } from '../notifications/meeting-ready.notifier.js';
import type { PipelineEvents } from './pipeline-engine.js';

/**
 * Pipeline progress out to the world: the meeting's WebSocket room (app open,
 * US-28/US-30) and the push channel (app closed, US-30). Never throws — a
 * notification problem must not fail or retry a step that already succeeded.
 */
@Injectable()
export class PipelineEventsAdapter implements PipelineEvents {
  private readonly logger = new Logger(PipelineEventsAdapter.name);

  constructor(
    private readonly room: MeetingRoomNotifier,
    private readonly push: MeetingReadyNotifier,
  ) {}

  processingStatus(payload: ProcessingStatusPayload): void {
    try {
      this.room.processingStatus(payload);
    } catch (error) {
      this.logger.warn(`processing_status emit failed for ${payload.meeting_id}: ${errorCode(error)}`);
    }
  }

  async meetingReady(meetingId: string): Promise<void> {
    try {
      this.room.meetingReady({ meeting_id: meetingId });
    } catch (error) {
      this.logger.warn(`meeting_ready emit failed for ${meetingId}: ${errorCode(error)}`);
    }
    await this.push.notify(meetingId);
  }
}
