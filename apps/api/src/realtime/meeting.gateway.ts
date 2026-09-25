import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace } from 'socket.io';
import { ApiErrorCode, MEETING_ROOM_NAMESPACE, WsClientEvent, WsServerEvent, type WsJoinAck } from '@meetio/shared';
import { MeetingsRepository } from '../meetings/meetings.repository.js';
import { createWsAuthMiddleware, type MeetingSocket } from './ws-auth.middleware.js';
import { SegmentIngestHandler } from './segment-ingest.handler.js';
import { MeetingRoomNotifier, meetingRoom } from './meeting-room.notifier.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound: WsJoinAck = { ok: false, error: { code: ApiErrorCode.MEETING_NOT_FOUND, message: 'Không tìm thấy cuộc họp' } };

/**
 * `/meeting-room` (api-spec §8). A socket belongs to at most one meeting at a
 * time; `transcript_segment` carries no meeting id and is written to the
 * meeting the socket joined — after an ownership check at join time.
 */
@WebSocketGateway({ namespace: MEETING_ROOM_NAMESPACE })
export class MeetingGateway implements OnGatewayInit {
  private readonly logger = new Logger(MeetingGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly meetings: MeetingsRepository,
    private readonly ingest: SegmentIngestHandler,
    private readonly notifier: MeetingRoomNotifier,
  ) {}

  afterInit(namespace: Namespace): void {
    namespace.use(createWsAuthMiddleware(this.jwt));
    this.notifier.attach(namespace);
  }

  /** phase-05 step 2: never trust the client — ownership is re-checked here, not assumed from the handshake. */
  @SubscribeMessage(WsClientEvent.JOIN_MEETING)
  async join(@ConnectedSocket() socket: MeetingSocket, @MessageBody() body: unknown): Promise<WsJoinAck> {
    const meetingId = (body as { meeting_id?: unknown } | null)?.meeting_id;
    if (typeof meetingId !== 'string' || !UUID.test(meetingId)) {
      return notFound;
    }
    try {
      await this.meetings.findOneOrFail(meetingId, socket.data.userId);
    } catch {
      return notFound;
    }
    if (socket.data.meetingId && socket.data.meetingId !== meetingId) {
      await socket.leave(meetingRoom(socket.data.meetingId));
    }
    socket.data.meetingId = meetingId;
    await socket.join(meetingRoom(meetingId));
    return { ok: true };
  }

  @SubscribeMessage(WsClientEvent.LEAVE_MEETING)
  async leave(@ConnectedSocket() socket: MeetingSocket): Promise<WsJoinAck> {
    if (socket.data.meetingId) {
      await socket.leave(meetingRoom(socket.data.meetingId));
      socket.data.meetingId = undefined;
    }
    return { ok: true };
  }

  /** Acked per seq, to this socket only, strictly after the row is committed. */
  @SubscribeMessage(WsClientEvent.TRANSCRIPT_SEGMENT)
  async segment(@ConnectedSocket() socket: MeetingSocket, @MessageBody() body: unknown): Promise<void> {
    const outcome = await this.ingest.handle(socket.data, body);
    const emit = socket.emit.bind(socket) as (event: string, payload: unknown) => boolean;
    if (outcome.kind === 'ack') {
      emit(WsServerEvent.SEGMENT_ACK, { seq: outcome.seq });
      return;
    }
    emit(WsServerEvent.SEGMENT_ERROR, outcome.payload);
    if (outcome.disconnect) {
      this.logger.debug(`Disconnecting socket ${socket.id}: ${outcome.payload.code}`);
      socket.disconnect(true);
    }
  }
}
