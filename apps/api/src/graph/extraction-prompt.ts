/**
 * Prompt for the extract step. Written in Vietnamese because the transcripts are; the schema is
 * enforced separately (`EXTRACTION_RESPONSE_SCHEMA`), so the prompt only has to explain meaning.
 */
export const EXTRACTION_SYSTEM_INSTRUCTION = `Bạn trích xuất đồ thị tri thức từ transcript cuộc họp tiếng Việt.
Transcript được chia thành các đoạn có nhãn [C1], [C2], ...

Thực thể (entities): chỉ những người, dự án, tổ chức, chủ đề, sản phẩm được NHẮC TÊN CỤ THỂ trong đoạn.
- type: person | project | organization | topic | product | other.
- name: giữ nguyên cách gọi trong transcript (vd "anh Bình", "Dự án ABC"); không bịa họ tên đầy đủ.
- description: một câu ngắn về vai trò/ý nghĩa, chỉ dựa trên transcript; bỏ trống nếu không rõ.
- chunks: MỌI nhãn đoạn có nhắc tới thực thể đó.
- Bỏ qua đại từ ("anh ấy", "bên kia") và danh từ chung chung ("khách hàng", "team").

Quan hệ (relations): chỉ những quan hệ được NÓI RÕ trong một đoạn.
- source, target: đúng name của hai thực thể đã liệt kê ở cùng đoạn đó.
- relationship: cụm động từ ngắn tiếng Việt (vd "phụ trách", "thuộc", "tham gia", "phụ thuộc vào").
- confidence: 0–1, mức chắc chắn rằng transcript nói đúng quan hệ này.
- chunk: nhãn đoạn chứa câu nói ra quan hệ.
Không suy diễn quan hệ không có trong transcript. Không có gì thì trả mảng rỗng.`;

export function extractionPrompt(chunks: readonly { label: string; content: string }[]): string {
  return chunks.map((c) => `[${c.label}]\n${c.content}`).join('\n\n');
}
