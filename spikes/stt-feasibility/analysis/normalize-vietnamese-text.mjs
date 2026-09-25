// Chuẩn hoá văn bản trước khi so khớp WER.
// Giữ nguyên dấu tiếng Việt (bỏ dấu là đổi nghĩa: "ma" ≠ "má" ≠ "mã"), chỉ gộp về NFC,
// hạ chữ thường, bỏ dấu câu. Engine iOS thêm dấu câu còn Android thì không — nếu không bỏ,
// WER sẽ phạt một khác biệt không liên quan gì tới việc nghe đúng hay sai.

const PUNCTUATION = /[\p{P}\p{S}]+/gu;
const WHITESPACE = /\s+/gu;

/** @param {string} text */
export function normalizeText(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

/** @param {string} text @returns {string[]} */
export function toWords(text) {
  const normalized = normalizeText(text);
  return normalized === '' ? [] : normalized.split(' ');
}
