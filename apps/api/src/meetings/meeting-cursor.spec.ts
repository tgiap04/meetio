import { BadRequestException } from '@nestjs/common';
import { decodeMeetingCursor, encodeMeetingCursor } from './meeting-cursor.js';

describe('meeting cursor', () => {
  const cursor = { createdAt: '2026-09-25T04:30:00.123456Z', id: '0b7e7d3e-4a4f-4d0f-9d6e-2f3a1b2c3d4e' };

  it('round-trips without losing microseconds', () => {
    expect(decodeMeetingCursor(encodeMeetingCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['millisecond timestamp', Buffer.from(JSON.stringify(['2026-09-25T04:30:00.123Z', cursor.id])).toString('base64url')],
    ['non-uuid id', Buffer.from(JSON.stringify([cursor.createdAt, "1' OR '1'='1"])).toString('base64url')],
    ['wrong shape', Buffer.from(JSON.stringify({ a: 1 })).toString('base64url')],
  ])('rejects %s with 400 VALIDATION_ERROR', (_, raw) => {
    try {
      decodeMeetingCursor(raw);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(((error as BadRequestException).getResponse() as { code: string }).code).toBe('VALIDATION_ERROR');
    }
  });
});
