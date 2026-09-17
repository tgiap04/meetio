import { MeetingStatus } from './enums/meeting-status.enum.js';
import { EntityType } from './enums/entity-type.enum.js';

/** Static seed content for `yarn db:seed`. Real transcript text, not lorem ipsum. */

export const SEED_USER = {
  email: 'to.khac.giap@sun-asterisk.com',
  displayName: 'Giáp Tô Khắc',
  password: 'Meetio-Seed-2026!',
};

export interface SeedSegment {
  speaker: string | null;
  text: string;
  startedAtMs: number;
  endedAtMs: number;
}

export interface SeedMeeting {
  title: string;
  status: MeetingStatus;
  sourceLanguage: string;
  summary: string | null;
  segments: SeedSegment[];
}

export const SEED_MEETINGS: SeedMeeting[] = [
  {
    title: 'Kick-off dự án Meetio',
    status: MeetingStatus.READY,
    sourceLanguage: 'vi-VN',
    summary:
      'Nhóm thống nhất kiến trúc backend dùng NestJS + Postgres/pgvector, Minh phụ trách schema ' +
      'cơ sở dữ liệu, hạn chót thứ Sáu tuần này.',
    segments: [
      {
        speaker: 'Giáp',
        text: 'Chào cả nhóm, hôm nay mình họp kick-off dự án Meetio, mục tiêu là thống nhất kiến trúc trước khi code.',
        startedAtMs: 0,
        endedAtMs: 6200,
      },
      {
        speaker: 'Minh',
        text: 'Mình đề xuất dùng NestJS cho backend và Postgres với extension pgvector để lưu embedding, vì team đã quen TypeScript.',
        startedAtMs: 6500,
        endedAtMs: 14800,
      },
      {
        speaker: 'Giáp',
        text: 'Đồng ý. Minh phụ trách thiết kế schema cơ sở dữ liệu, cần xong trước thứ Sáu để Lan bắt đầu viết API.',
        startedAtMs: 15000,
        endedAtMs: 22300,
      },
      {
        speaker: 'Minh',
        text: 'Ok mình nhận việc này. Sẽ ưu tiên bảng transcript_segments và meeting_chunks trước vì đó là lõi của sản phẩm.',
        startedAtMs: 22600,
        endedAtMs: 30100,
      },
      {
        speaker: 'Lan',
        text: 'Bên mobile thì mình cần biết API trả về format gì để dựng UI song song, tuần sau có thể review được không?',
        startedAtMs: 30400,
        endedAtMs: 37900,
      },
    ],
  },
  {
    title: 'Rà soát lỗi backend tuần 3',
    status: MeetingStatus.READY,
    sourceLanguage: 'vi-VN',
    summary:
      'Phát hiện lỗi race condition khi hai client cùng gửi transcript segment trùng seq; Minh sẽ thêm ' +
      'ràng buộc UNIQUE và xử lý lỗi 409 ở tầng API.',
    segments: [
      {
        speaker: 'Minh',
        text: 'Tuần này có báo lỗi: khi mất mạng rồi gửi lại transcript, đôi khi bị trùng đoạn văn bản trong transcript_segments.',
        startedAtMs: 0,
        endedAtMs: 8100,
      },
      {
        speaker: 'Giáp',
        text: 'Đúng như lo ngại lúc thiết kế. Mình cần ràng buộc UNIQUE trên (meeting_id, seq) để insert lại không tạo bản ghi mới.',
        startedAtMs: 8400,
        endedAtMs: 16700,
      },
      {
        speaker: 'Minh',
        text: 'Mình sẽ thêm migration cho UNIQUE constraint đó, đồng thời API cần bắt lỗi 23505 và trả về 409 thay vì 500.',
        startedAtMs: 17000,
        endedAtMs: 25200,
      },
      {
        speaker: 'Lan',
        text: 'Ở phía mobile mình sẽ retry khi nhận 409 và coi như thành công, không hiển thị lỗi cho người dùng.',
        startedAtMs: 25500,
        endedAtMs: 32000,
      },
    ],
  },
  {
    title: 'Phỏng vấn ứng viên Backend Intern',
    status: MeetingStatus.PROCESSING,
    sourceLanguage: 'vi-VN',
    summary: null,
    segments: [
      {
        speaker: 'Giáp',
        text: 'Chào bạn, giới thiệu qua về kinh nghiệm của bạn với Postgres và TypeORM nhé.',
        startedAtMs: 0,
        endedAtMs: 5400,
      },
      {
        speaker: null,
        text: 'Dạ em đã dùng TypeORM trong đồ án tốt nghiệp, có làm việc với migration và quan hệ nhiều-nhiều.',
        startedAtMs: 5700,
        endedAtMs: 13200,
      },
      {
        speaker: 'Minh',
        text: 'Bạn có biết vì sao không nên bật synchronize true trong môi trường production không?',
        startedAtMs: 13500,
        endedAtMs: 18900,
      },
    ],
  },
];

export const SEED_ENTITIES: Array<{ canonicalName: string; type: EntityType; description: string; aliases: string[] }> = [
  {
    canonicalName: 'Minh',
    type: EntityType.PERSON,
    description: 'Kỹ sư backend, phụ trách thiết kế schema cơ sở dữ liệu của Meetio.',
    aliases: ['Minh Trần'],
  },
  {
    canonicalName: 'Lan',
    type: EntityType.PERSON,
    description: 'Kỹ sư mobile, phụ trách ứng dụng ghi âm và hiển thị transcript.',
    aliases: [],
  },
  {
    canonicalName: 'Meetio',
    type: EntityType.PROJECT,
    description: 'Sản phẩm ghi âm, gỡ băng và tóm tắt cuộc họp bằng AI, có đồ thị tri thức theo người dùng.',
    aliases: ['dự án Meetio'],
  },
];

export const SEED_ACTION_ITEMS = [
  {
    meetingIndex: 0,
    assigneeEntityName: 'Minh',
    content: 'Thiết kế schema cơ sở dữ liệu cho transcript_segments và meeting_chunks.',
    dueDate: '2026-09-19',
  },
  {
    meetingIndex: 1,
    assigneeEntityName: 'Minh',
    content: 'Thêm ràng buộc UNIQUE (meeting_id, seq) và trả 409 khi trùng.',
    dueDate: '2026-09-24',
  },
];
