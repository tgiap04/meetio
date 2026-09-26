/**
 * The full privacy-policy text, rendered by `app/(app)/privacy-policy.tsx`
 * and kept from drifting off `docs/privacy-policy.md` by
 * `privacy-policy.test.ts`.
 *
 * Every string below is a verbatim copy of that document's body — copied,
 * not paraphrased, so the two cannot silently diverge. Deliberately NOT
 * copied here (see the test for the matching exclusion on the doc side):
 * - The H1 title ("# Chính sách quyền riêng tư của Meetio") — the screen
 *   renders its own title via `ScreenHeader` instead of a body block.
 * - The internal `> **Cần bổ sung trước khi phát hành:** ...` callout — a
 *   note to whoever ships this policy (fill in the legal entity's name,
 *   address, contact email, server location), not end-user policy text. It
 *   must never reach a real user's screen looking like an unfinished app.
 *
 * `PRIVACY_POLICY_META` (version + updated date) IS shown in-app, just as a
 * caption rather than a body block — see the screen.
 */

export const PRIVACY_POLICY_META = {
  consentVersion: 2,
  updatedLabel: 'Cập nhật: 27/09/2026',
} as const;

export interface PrivacyPolicyBullet {
  /** Bold lead-in before the colon in the source doc, e.g. "Tài khoản". Some
   *  bullets (section 4) carry no label — plain sentences instead. */
  label?: string;
  text: string;
}

export interface PrivacyPolicyTableRow {
  recipient: string;
  data: string;
  purpose: string;
}

export type PrivacyPolicyBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: PrivacyPolicyBullet[] }
  | { type: 'table'; header: PrivacyPolicyTableRow; rows: PrivacyPolicyTableRow[] };

export const PRIVACY_POLICY_CONTENT: readonly PrivacyPolicyBlock[] = [
  {
    type: 'paragraph',
    text: 'Meetio giúp bạn ghi lại, chép lời, tóm tắt và hỏi đáp về các cuộc họp. Chính sách này nói rõ Meetio thu thập dữ liệu gì, đưa dữ liệu đi đâu, giữ trong bao lâu và bạn có những quyền gì, theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.',
  },
  { type: 'heading', text: '1. Dữ liệu Meetio thu thập' },
  {
    type: 'bullets',
    items: [
      {
        label: 'Tài khoản',
        text: 'email, tên hiển thị, mật khẩu (chỉ lưu dạng băm) hoặc định danh tài khoản Google nếu bạn đăng nhập bằng Google.',
      },
      {
        label: 'Nội dung cuộc họp',
        text: 'bản chép lời (văn bản) do điện thoại của bạn tạo ra, tiêu đề, thời gian và thời lượng cuộc họp, những chỉnh sửa bạn làm trên bản chép lời.',
      },
      {
        label: 'Kết quả AI',
        text: 'tóm tắt, việc cần làm, các thực thể và quan hệ (người, dự án, chủ đề…) rút ra từ cuộc họp, lịch sử hỏi đáp của bạn.',
      },
      { label: 'Thiết bị', text: 'mã nhận thông báo đẩy (push token) nếu bạn cho phép thông báo.' },
      { label: 'Mức sử dụng', text: 'số token AI mỗi lượt xử lý, để tính hạn mức và chi phí.' },
    ],
  },
  { type: 'heading', text: '2. Âm thanh không rời khỏi điện thoại' },
  {
    type: 'paragraph',
    text: 'Việc nhận diện giọng nói chạy trên điện thoại của bạn. Meetio không ghi lại và không gửi tệp âm thanh lên máy chủ; chỉ văn bản đã chép lời được gửi đi. Nếu sau này Meetio chuyển sang nhận diện trên máy chủ, đó là thay đổi lớn về chính sách và Meetio sẽ xin bạn đồng ý lại trước.',
  },
  { type: 'heading', text: '3. Dữ liệu được gửi đi đâu' },
  {
    type: 'table',
    header: { recipient: 'Nơi nhận', data: 'Dữ liệu', purpose: 'Để làm gì' },
    rows: [
      {
        recipient: 'Máy chủ Meetio',
        data: 'Bản chép lời, tài khoản, kết quả AI, lịch sử hỏi đáp',
        purpose: 'Lưu trữ, đồng bộ giữa các thiết bị, tìm kiếm',
      },
      {
        recipient: 'Google (Gemini API)',
        data: 'Văn bản bản chép lời, câu hỏi của bạn',
        purpose: 'Chia đoạn và tạo vector tìm kiếm, rút thực thể, tóm tắt, trả lời câu hỏi',
      },
      {
        recipient: 'Expo (dịch vụ thông báo đẩy)',
        data: 'Mã thiết bị và một thông báo chung chung',
        purpose:
          'Báo khi cuộc họp xử lý xong hoặc sắp bị xóa theo hạn lưu trữ. Thông báo không chứa tiêu đề hay nội dung cuộc họp',
      },
    ],
  },
  {
    type: 'paragraph',
    text: 'Meetio không bán dữ liệu của bạn và không dùng nội dung cuộc họp để quảng cáo.',
  },
  { type: 'heading', text: '4. Thời gian lưu trữ' },
  {
    type: 'bullets',
    items: [
      {
        text: 'Cuộc họp được giữ cho tới khi bạn xóa, hoặc tới hạn lưu trữ bạn chọn trong Cài đặt (số ngày tính từ lúc cuộc họp kết thúc). Trước hạn 7 ngày, Meetio gửi một thông báo nhắc; đến hạn, cuộc họp bị xóa hẳn cùng mọi dữ liệu gắn với nó.',
      },
      {
        text: 'Xóa một cuộc họp là xóa hẳn: bản chép lời, tóm tắt, việc cần làm, lịch sử hỏi đáp của cuộc họp đó, và những thực thể không còn được nhắc ở cuộc họp nào khác.',
      },
      { text: 'Xóa tài khoản: đăng nhập bị chặn ngay; toàn bộ dữ liệu bị xóa hẳn sau 30 ngày.' },
    ],
  },
  { type: 'heading', text: '5. Quyền của bạn' },
  {
    type: 'paragraph',
    text: 'Theo Nghị định 13/2023/NĐ-CP, bạn có quyền được biết, đồng ý hoặc rút lại sự đồng ý, truy cập, chỉnh sửa, xóa dữ liệu, hạn chế xử lý và phản đối việc xử lý. Trong ứng dụng, bạn có thể xem và sửa bản chép lời, xóa từng cuộc họp, đặt hạn lưu trữ, tắt thông báo và xóa tài khoản. Rút lại sự đồng ý nghĩa là ngừng ghi và xử lý cuộc họp mới; bạn có thể xóa các cuộc họp đã có.',
  },
  { type: 'heading', text: '6. Bảo mật' },
  {
    type: 'paragraph',
    text: 'Mọi kết nối tới máy chủ dùng mã hóa TLS. Mã đăng nhập được lưu trong vùng lưu trữ an toàn của điện thoại. Máy chủ chỉ cho mỗi người đọc dữ liệu của chính mình. Nội dung bản chép lời, câu hỏi và câu trả lời không được ghi vào nhật ký hệ thống.',
  },
  { type: 'heading', text: '7. Đồng ý' },
  {
    type: 'paragraph',
    text: 'Trước lần ghi đầu tiên, và mỗi khi nội dung đồng ý thay đổi, Meetio hỏi bạn đồng ý với việc xử lý nêu trên. Không đồng ý thì bạn không thể ghi cuộc họp mới.',
  },
] as const;

/** One flat string, in reading order — labels rejoined with their bullet text
 *  and every table row's three cells rejoined — collapsed to single spaces.
 *  This is the exact shape `privacy-policy.test.ts` compares against the
 *  same collapse applied to the source markdown, so block boundaries here
 *  don't need to mirror the doc's line breaks, only the word sequence does. */
export function flattenPrivacyPolicyContent(blocks: readonly PrivacyPolicyBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      parts.push(block.text);
    } else if (block.type === 'bullets') {
      for (const item of block.items) {
        parts.push(item.label ? `${item.label}: ${item.text}` : item.text);
      }
    } else {
      const rowText = (row: PrivacyPolicyTableRow) => `${row.recipient} ${row.data} ${row.purpose}`;
      parts.push(rowText(block.header));
      for (const row of block.rows) {
        parts.push(rowText(row));
      }
    }
  }

  return normalizeWhitespace(parts.join(' '));
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
