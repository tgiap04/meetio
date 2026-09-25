// Adversarial WER tests: verify optimized Levenshtein against brute-force reference.
// 500 random pairs of length ≤8 over a 4-word vocab.
// Requirement: S + D + I from optimized = edit distance from reference.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordErrorRate } from '../word-error-rate.mjs';

/**
 * Reference brute-force Levenshtein with edit operation breakdown.
 * @param {string[]} ref
 * @param {string[]} hyp
 * @returns {{ cost: number, subs: number, dels: number, ins: number }}
 */
function bruteForceWER(ref, hyp) {
  const n = ref.length;
  const m = hyp.length;

  // Full matrix with backtracking to count operations
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  const ops = Array.from({ length: n + 1 }, () => Array(m + 1).fill({ subs: 0, dels: 0, ins: 0 }));

  // Initialize first row (insertions)
  for (let j = 0; j <= m; j += 1) {
    dp[0][j] = j;
    ops[0][j] = { subs: 0, dels: 0, ins: j };
  }

  // Initialize first column (deletions)
  for (let i = 0; i <= n; i += 1) {
    dp[i][0] = i;
    ops[i][0] = { subs: 0, dels: i, ins: 0 };
  }

  // Fill DP table
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;

      const diag = dp[i - 1][j - 1] + cost;
      const down = dp[i - 1][j] + 1;
      const right = dp[i][j - 1] + 1;

      let minCost = diag;
      let op = ops[i - 1][j - 1];
      if (cost === 1) {
        op = { ...op, subs: op.subs + 1 };
      }

      if (down < minCost) {
        minCost = down;
        op = { ...ops[i - 1][j], dels: ops[i - 1][j].dels + 1 };
      } else if (down === minCost && down < diag) {
        op = { ...ops[i - 1][j], dels: ops[i - 1][j].dels + 1 };
      }

      if (right < minCost) {
        minCost = right;
        op = { ...ops[i][j - 1], ins: ops[i][j - 1].ins + 1 };
      } else if (right === minCost && right < diag) {
        op = { ...ops[i][j - 1], ins: ops[i][j - 1].ins + 1 };
      }

      dp[i][j] = minCost;
      ops[i][j] = op;
    }
  }

  return {
    cost: dp[n][m],
    subs: ops[n][m].subs,
    dels: ops[n][m].dels,
    ins: ops[n][m].ins,
  };
}

/**
 * Generate random word sequence from small vocab.
 * @param {number} length
 * @returns {string[]}
 */
function randomWords(length) {
  const vocab = ['một', 'hai', 'ba', 'bốn'];
  return Array.from({ length }, () => vocab[Math.floor(Math.random() * vocab.length)]);
}

test('500 random pairs verify S+D+I == edit distance', () => {
  let failures = [];

  for (let trial = 0; trial < 500; trial += 1) {
    const refLen = Math.floor(Math.random() * 9); // 0-8
    const hypLen = Math.floor(Math.random() * 9);

    const ref = randomWords(refLen);
    const hyp = randomWords(hypLen);

    const optimized = wordErrorRate(ref, hyp);
    const brute = bruteForceWER(ref, hyp);

    const optimizedSum = optimized.substitutions + optimized.deletions + optimized.insertions;

    if (optimizedSum !== brute.cost) {
      failures.push({
        trial,
        ref,
        hyp,
        optimized: { sum: optimizedSum, ...optimized },
        brute,
      });
    }
  }

  if (failures.length > 0) {
    console.log('Failures:', JSON.stringify(failures.slice(0, 3), null, 2));
  }

  assert.equal(failures.length, 0, `${failures.length} mismatches in 500 random pairs`);
});

test('tie-breaking: diagonal (sub) preferred over up (del) and left (ins)', () => {
  // "a" vs "a" → should be 0 subs/dels/ins, not other combos
  const r1 = wordErrorRate(['a'], ['a']);
  assert.deepEqual([r1.substitutions, r1.deletions, r1.insertions], [0, 0, 0]);

  // "a" vs "b" → should be 1 sub, not 1 del + 1 ins
  const r2 = wordErrorRate(['a'], ['b']);
  assert.deepEqual([r2.substitutions, r2.deletions, r2.insertions], [1, 0, 0]);

  // Longer: tie-breaking should prefer diagonal consistently
  const r3 = wordErrorRate(['a', 'b'], ['c', 'd']);
  assert.equal(r3.substitutions, 2);
  assert.equal(r3.deletions, 0);
  assert.equal(r3.insertions, 0);
});

test('empty cases', () => {
  assert.equal(wordErrorRate([], []).wer, 0);
  assert.equal(wordErrorRate([], ['a']).wer, Infinity);
  assert.deepEqual(
    [wordErrorRate(['a'], []).substitutions, wordErrorRate(['a'], []).deletions],
    [0, 1],
  );
});
