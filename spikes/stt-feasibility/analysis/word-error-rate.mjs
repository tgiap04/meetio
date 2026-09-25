// WER theo khoảng cách Levenshtein trên từ: (S + D + I) / N, N = số từ của bản chép tay.
// 60 phút họp ≈ 9.000 từ mỗi bên → ~81 triệu ô. Không giữ ma trận truy vết; chỉ giữ hai hàng,
// mỗi hàng bốn Int32Array (tổng lỗi, S, D, I) để tách loại lỗi mà không cấp phát theo từng ô.

/**
 * @param {string[]} reference
 * @param {string[]} hypothesis
 * @returns {{ substitutions: number, deletions: number, insertions: number, referenceWords: number, wer: number }}
 */
export function wordErrorRate(reference, hypothesis) {
  const n = reference.length;
  const m = hypothesis.length;
  const row = () => ({
    cost: new Int32Array(m + 1),
    sub: new Int32Array(m + 1),
    del: new Int32Array(m + 1),
    ins: new Int32Array(m + 1),
  });
  let prev = row();
  let curr = row();
  for (let j = 0; j <= m; j += 1) {
    prev.cost[j] = j;
    prev.ins[j] = j;
  }

  for (let i = 1; i <= n; i += 1) {
    curr.cost[0] = i;
    curr.sub[0] = 0;
    curr.del[0] = i;
    curr.ins[0] = 0;
    const refWord = reference[i - 1];
    for (let j = 1; j <= m; j += 1) {
      const mismatch = refWord === hypothesis[j - 1] ? 0 : 1;
      const diagonal = prev.cost[j - 1] + mismatch;
      const deletion = prev.cost[j] + 1;
      const insertion = curr.cost[j - 1] + 1;
      // Hoà điểm ưu tiên đường chéo: một chữ nghe sai là một lỗi thay thế, không phải xoá + chèn.
      if (diagonal <= deletion && diagonal <= insertion) {
        curr.cost[j] = diagonal;
        curr.sub[j] = prev.sub[j - 1] + mismatch;
        curr.del[j] = prev.del[j - 1];
        curr.ins[j] = prev.ins[j - 1];
      } else if (deletion <= insertion) {
        curr.cost[j] = deletion;
        curr.sub[j] = prev.sub[j];
        curr.del[j] = prev.del[j] + 1;
        curr.ins[j] = prev.ins[j];
      } else {
        curr.cost[j] = insertion;
        curr.sub[j] = curr.sub[j - 1];
        curr.del[j] = curr.del[j - 1];
        curr.ins[j] = curr.ins[j - 1] + 1;
      }
    }
    [prev, curr] = [curr, prev];
  }

  const substitutions = prev.sub[m];
  const deletions = prev.del[m];
  const insertions = prev.ins[m];
  return {
    substitutions,
    deletions,
    insertions,
    referenceWords: n,
    // Bản chép tay rỗng mà vẫn có chữ nhận ra thì mọi chữ đều là lỗi chèn — không có mẫu số hợp lệ.
    wer: n === 0 ? (m === 0 ? 0 : Infinity) : (substitutions + deletions + insertions) / n,
  };
}
