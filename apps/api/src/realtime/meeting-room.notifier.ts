import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import {
  WsServerEvent,
  type MeetingReadyPayload,
  type ProcessingStatusPayload,
  type SegmentTranslation,
  type SegmentTranslationFailedPayload,
} from '@meetio/shared';

export const meetingRoom = (meetingId: string) => `meeting:${meetingId}`;

/**
 * How background work (Phase 09 translation, Phase 11 pipeline) talks to the
 * clients in a meeting's room. Rooms live in this process's memory: correct
 * while workers run inside the API process, as BullMQ processors do today. A
 * worker in a separate process would need the socket.io Redis adapter.
 */
@Injectable()
export class MeetingRoomNotifier {
  private namespace: Namespace | null = null;

  attach(namespace: Namespace): void {
    this.namespace = namespace;
  }

  processingStatus(payload: ProcessingStatusPayload): void {
    this.namespace?.to(meetingRoom(payload.meeting_id)).emit(WsServerEvent.PROCESSING_STATUS, payload);
  }

  meetingReady(payload: MeetingReadyPayload): void {
    this.namespace?.to(meetingRoom(payload.meeting_id)).emit(WsServerEvent.MEETING_READY, payload);
  }

  segmentTranslated(meetingId: string, payload: SegmentTranslation): void {
    this.namespace?.to(meetingRoom(meetingId)).emit(WsServerEvent.SEGMENT_TRANSLATED, { ...payload, meeting_id: meetingId });
  }

  /** Translation of one segment gave up; the client offers a manual retry. */
  segmentTranslationFailed(meetingId: string, payload: Omit<SegmentTranslationFailedPayload, 'meeting_id'>): void {
    this.namespace?.to(meetingRoom(meetingId)).emit(WsServerEvent.SEGMENT_TRANSLATION_FAILED, { ...payload, meeting_id: meetingId });
  }
}
