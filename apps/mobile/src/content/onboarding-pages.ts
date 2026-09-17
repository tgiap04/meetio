/**
 * Copy for the three onboarding pages (design.png, screen 2, plus decisions.md
 * §7). Page 1 is verbatim from the design; pages 2 and 3 draw their subject
 * from written specs only — E3 (US-17, US-18, US-19) for parallel translation,
 * E6 (US-35, US-36, US-38) for the knowledge graph and cited Q&A — never
 * invented product claims.
 */
export interface OnboardingPage {
  key: string;
  title: string;
  body: string;
}

export const ONBOARDING_PAGES: readonly OnboardingPage[] = [
  {
    key: 'record-transcribe',
    title: 'Ghi âm & Chuyển đổi\nthành văn bản',
    body: 'Meetio giúp bạn ghi âm cuộc họp từ bất kỳ nguồn âm thanh nào, chuyển giọng nói thành văn bản theo thời gian thực.',
  },
  {
    key: 'parallel-translation',
    title: 'Dịch song song\nngay trong cuộc họp',
    body: 'Bật dịch và chọn ngôn ngữ đích, Meetio hiển thị bản dịch ngay dưới từng câu gốc và giữ lại để bạn xem lại sau cuộc họp.',
  },
  {
    key: 'knowledge-graph-qa',
    title: 'Đồ thị tri thức\n& Hỏi đáp có nguồn',
    body: 'Meetio rút ra người, dự án và chủ đề từ các cuộc họp, rồi trả lời câu hỏi của bạn kèm trích dẫn về đúng đoạn transcript.',
  },
];
