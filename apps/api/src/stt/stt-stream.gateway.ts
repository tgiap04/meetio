import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Namespace } from 'socket.io';
import {
  STT_STREAM_NAMESPACE,
  SttStreamClientEvent,
  SttStreamErrorCode,
  SttStreamServerEvent,
  type SttStreamAck,
  type SttStreamErrorPayload,
  type SttStreamTextPayload,
} from '@meetio/shared';
import { createWsAuthMiddleware, type MeetingSocket } from '../realtime/ws-auth.middleware.js';
import { SttStreamRefusal, SttStreamService } from './stt-stream.service.js';
import type { SttStream } from './stt-stream.js';

// The namespace is declared without typed events (like /meeting-room), so emit takes a plain event name.
const emitTo = (socket: MeetingSocket, event: string, payload: unknown) => (socket.emit as (event: string, payload: unknown) => boolean).call(socket, event, payload);

/** Frames with no started stream tolerated before the socket is dropped (one error is sent, not one per frame). */
const MAX_STRAY_FRAMES = 20;

const OK: SttStreamAck = { ok: true };
const NOT_STARTED_MESSAGE = 'Chưa bắt đầu luồng nhận diện';
const notStarted: SttStreamAck = { ok: false, error: { code: SttStreamErrorCode.STREAM_NOT_STARTED, message: NOT_STARTED_MESSAGE } };

/**
 * `/stt-stream` (api-spec §8b): the app streams PCM16 16 kHz mono frames and receives `stt_partial`
 * and `stt_final`. Authenticated at the handshake exactly like `/meeting-room`; consent and budget
 * are checked at `stt_start`. A socket owns at most one stream, closed with the socket. Nothing
 * about the audio or the transcript is logged.
 */
@WebSocketGateway({ namespace: STT_STREAM_NAMESPACE })
export class SttStreamGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(SttStreamGateway.name);
  private readonly streams = new Map<string, SttStream>();
  private readonly strayFrames = new Map<string, number>();

  constructor(
    private readonly jwt: JwtService,
    private readonly service: SttStreamService,
  ) {}

  afterInit(namespace: Namespace): void {
    namespace.use(createWsAuthMiddleware(this.jwt));
  }

  @SubscribeMessage(SttStreamClientEvent.START)
  async start(@ConnectedSocket() socket: MeetingSocket, @MessageBody() body: unknown): Promise<SttStreamAck> {
    // A start on a socket that already streams replaces that stream in the service, but only once the new start is accepted.
    try {
      const stream = await this.service.open(socket.data.userId, body, {
        partial: (text) => emitTo(socket, SttStreamServerEvent.PARTIAL, { text } satisfies SttStreamTextPayload),
        final: (text) => emitTo(socket, SttStreamServerEvent.FINAL, { text } satisfies SttStreamTextPayload),
        fatal: (code, message) => {
          this.streams.delete(socket.id); // an ended stream is not kept
          emitTo(socket, SttStreamServerEvent.ERROR, { code, message } satisfies SttStreamErrorPayload);
        },
      }, socket.data.tokenExp);
      if (stream.isEnded) return OK; // ended while opening (replaced); the client got the error already
      this.strayFrames.delete(socket.id);
      if (!socket.connected) {
        stream.close(); // the socket went away while the Live session was opening
        return OK;
      }
      this.streams.set(socket.id, stream);
      return OK;
    } catch (error) {
      if (error instanceof SttStreamRefusal) return { ok: false, error: { code: error.code, message: error.message } };
      this.logger.warn(`stt_start failed unexpectedly (${error instanceof Error ? error.name : 'Error'})`);
      return { ok: false, error: { code: SttStreamErrorCode.AI_SERVICE_UNAVAILABLE, message: 'Không bắt đầu được nhận diện giọng nói' } };
    }
  }

  @SubscribeMessage(SttStreamClientEvent.AUDIO)
  audio(@ConnectedSocket() socket: MeetingSocket, @MessageBody() frame: unknown): void {
    const stream = this.streams.get(socket.id);
    if (!stream) {
      const stray = (this.strayFrames.get(socket.id) ?? 0) + 1;
      this.strayFrames.set(socket.id, stray);
      if (stray > MAX_STRAY_FRAMES) {
        socket.disconnect(true);
        return;
      }
      if (stray > 1) return;
      emitTo(socket, SttStreamServerEvent.ERROR, { code: SttStreamErrorCode.STREAM_NOT_STARTED, message: NOT_STARTED_MESSAGE } satisfies SttStreamErrorPayload);
      return;
    }
    stream.push(frame);
  }

  /** Acked once the last words have been flushed (or the bounded wait passed). */
  @SubscribeMessage(SttStreamClientEvent.STOP)
  async stop(@ConnectedSocket() socket: MeetingSocket): Promise<SttStreamAck> {
    const stream = this.streams.get(socket.id);
    if (!stream) return notStarted;
    this.streams.delete(socket.id);
    try {
      await stream.stop();
    } catch (error) {
      this.logger.warn(`stt_stop failed (${error instanceof Error ? error.name : 'Error'})`);
      stream.close();
    }
    return OK;
  }

  handleDisconnect(socket: MeetingSocket): void {
    this.strayFrames.delete(socket.id);
    this.streams.get(socket.id)?.close();
    this.streams.delete(socket.id);
  }
}
