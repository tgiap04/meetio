/**
 * Engine errors the user has to act on, in words they understand. Everything else (`no-speech`,
 * `speech-timeout`, `aborted`, `busy`, …) is the engine stopping on its own — the restart loop
 * handles it silently and the gap shows in the transcript.
 */
const PROBLEMS: Record<string, string> = {
  'not-allowed': 'Meetio chưa được cấp quyền micro hoặc nhận diện giọng nói. Mở Cài đặt của máy để cấp quyền.',
  'service-not-allowed': 'Nhận diện giọng nói đang bị tắt trên máy. Bật Siri & Đọc chính tả (iOS) hoặc dịch vụ nhận diện của Google (Android).',
  'language-not-supported': 'Máy chưa tải gói nhận diện offline cho ngôn ngữ này. Tải gói trong Cài đặt của máy rồi thử lại.',
  'audio-capture': 'Không mở được micro — có thể một ứng dụng khác đang dùng.',
};

export function engineProblemMessage(code: string): string | null {
  return PROBLEMS[code] ?? null;
}
