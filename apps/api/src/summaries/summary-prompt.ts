/** Prompts for the summarize step. The schema is enforced separately (`SUMMARY_RESPONSE_SCHEMA`). */

const LANGUAGES: Record<string, string> = { vi: 'tiếng Việt', en: 'English', ja: '日本語', ko: '한국어', zh: '中文' };

/** "Write in the meeting's language" (phase-14 NFR) — from `source_language`, e.g. vi-VN → tiếng Việt. */
export const languageName = (sourceLanguage: string) => LANGUAGES[sourceLanguage.slice(0, 2).toLowerCase()] ?? 'the language the transcript is written in';

const WEEKDAYS = ['Chủ nhật / Sunday', 'Thứ Hai / Monday', 'Thứ Ba / Tuesday', 'Thứ Tư / Wednesday', 'Thứ Năm / Thursday', 'Thứ Sáu / Friday', 'Thứ Bảy / Saturday'];

/** "2026-09-26 (Thứ Bảy / Saturday)" — without the weekday the model resolved "thứ Sáu" to the meeting day itself. */
export const withWeekday = (isoDate: string) => `${isoDate} (${WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()]})`;

export function summarySystemInstruction(sourceLanguage: string, meetingDate: string): string {
  return `You write the executive summary of a meeting transcript. The transcript is split into labelled parts [C1], [C2], ...
Write every text field in ${languageName(sourceLanguage)}.

summary_points: the main points, 3–8 short sentences. Each cites in "sources" the labels of the parts it comes from.
decisions: what was agreed or decided, if anything; each with its source labels. Empty if nothing was decided.
Only state what the transcript says. Never add facts, names, numbers or dates it does not contain.

action_items: concrete tasks someone committed to or was asked to do.
- content: the task, short and specific.
- assignee: the person's name ONLY if the transcript explicitly says who does it (e.g. "Bình làm phần thanh toán nhé").
  If it is not said clearly, null. Never guess from context, roles or who seems likely.
- due_date: YYYY-MM-DD only if a deadline is stated. The meeting took place on ${withWeekday(meetingDate)}; resolve
  relative deadlines ("thứ Sáu", "cuối tuần sau", "next Monday") against that date — a weekday means the next such
  day after the meeting, never the meeting day itself unless the transcript says "hôm nay" / "today". If vague, null.
- source: the single label where the task is stated.

insufficient: true if the transcript is too short or has no real content to summarize (small talk, silence, tests).
Then leave the lists empty.`;
}

export function summaryPrompt(parts: readonly { label: string; content: string }[]): string {
  return parts.map((p) => `[${p.label}]\n${p.content}`).join('\n\n');
}

/** Second tier: the partial summaries of a long meeting become the labelled parts [P1], [P2], ... */
export function mergeSystemInstruction(sourceLanguage: string, meetingDate: string): string {
  return `${summarySystemInstruction(sourceLanguage, meetingDate).replace('meeting transcript', 'meeting').replace('[C1], [C2]', '[P1], [P2]')}
The parts are already partial summaries of consecutive sections of one long meeting. Merge them into one summary:
combine repeated points, keep every important point, and cite the part labels. Leave action_items empty — they are kept from the parts.`;
}
