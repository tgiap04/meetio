// Đọc file JSONL do app spike ghi ra và dựng lại các phiên nhận diện.
// Mỗi dòng: { event, timestamp (epoch ms), session_id, text?, error?, ... }.

/** @typedef {{ event: string, timestamp: number, session_id?: string, text?: string, error?: string, [k: string]: unknown }} LogEvent */
/** @typedef {{ id: string, startedAt: number, endedAt: number | null, endReason: 'auto_stop' | 'error' | 'user_stop' | null, text: string, background: boolean }} Session */

/** @param {string} jsonl @returns {LogEvent[]} */
export function parseLog(jsonl) {
  const events = [];
  const lines = jsonl.split('\n').filter((line) => line.trim() !== '');
  lines.forEach((line, index) => {
    try {
      events.push(JSON.parse(line));
    } catch {
      // App bị giết giữa lúc ghi có thể để lại dòng cuối cụt; dòng hỏng ở giữa file thì là lỗi thật.
      if (index === lines.length - 1) return;
      throw new Error(`Dòng ${index + 1} không phải JSON hợp lệ: ${line.slice(0, 80)}`);
    }
  });
  return events.sort((a, b) => a.timestamp - b.timestamp);
}

// Android trả mỗi câu một kết quả final riêng; iOS có thể trả chuỗi cộng dồn cả phiên.
// Nếu đoạn mới bắt đầu bằng phần đã có thì thay thế, không thì nối tiếp.
/** @param {string} accumulated @param {string} next */
export function mergeRecognizedText(accumulated, next) {
  const trimmed = next.trim();
  if (trimmed === '') return accumulated;
  if (accumulated === '') return trimmed;
  if (trimmed.startsWith(accumulated)) return trimmed;
  return `${accumulated} ${trimmed}`;
}

/** @param {LogEvent[]} events @returns {{ meta: LogEvent | undefined, playbackStartedAt: number | null, sessions: Session[], runEndedAt: number | null }} */
export function buildSessions(events) {
  /** @type {Map<string, Session & { pendingPartial: string, sawError: boolean }>} */
  const sessions = new Map();
  let inBackground = false;

  for (const e of events) {
    if (e.event === 'app_background') inBackground = true;
    if (e.event === 'app_foreground') inBackground = false;
    const id = e.session_id;
    if (!id) continue;

    if (e.event === 'start' && !sessions.has(id)) {
      sessions.set(id, {
        id,
        startedAt: e.timestamp,
        endedAt: null,
        endReason: null,
        text: '',
        background: inBackground,
        pendingPartial: '',
        sawError: false,
      });
      continue;
    }
    const s = sessions.get(id);
    if (!s || s.endedAt !== null) continue;

    if (e.event === 'partial') s.pendingPartial = e.text ?? '';
    if (e.event === 'final') {
      s.text = mergeRecognizedText(s.text, e.text ?? '');
      s.pendingPartial = '';
    }
    // `error` không đóng phiên: recognizer có thể còn đẩy kết quả cuối trước `end`, và app luôn ghi
    // `auto_stop` sau lỗi (kể cả khi `end` không bao giờ tới). Lỗi chỉ đổi lý do kết thúc.
    if (e.event === 'error') s.sawError = true;
    if (e.event === 'auto_stop' || e.event === 'user_stop') {
      // Chữ còn nằm ở partial lúc phiên chết vẫn hiện trên màn hình của app thật — tính là đã nhận ra.
      s.text = mergeRecognizedText(s.text, s.pendingPartial);
      s.pendingPartial = '';
      s.endedAt = e.timestamp;
      s.endReason = e.event === 'auto_stop' && s.sawError ? 'error' : e.event;
    }
  }

  const playback = events.find((e) => e.event === 'mark_playback');
  const runEnd = [...events].reverse().find((e) => e.event === 'run_stop');
  return {
    meta: events.find((e) => e.event === 'run_meta'),
    playbackStartedAt: playback ? playback.timestamp : null,
    sessions: [...sessions.values()].map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      endReason: s.endReason,
      text: mergeRecognizedText(s.text, s.pendingPartial),
      background: s.background,
    })),
    runEndedAt: runEnd ? runEnd.timestamp : null,
  };
}
