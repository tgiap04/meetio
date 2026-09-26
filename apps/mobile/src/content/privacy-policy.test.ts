import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PRIVACY_POLICY_CONTENT,
  flattenPrivacyPolicyContent,
  normalizeWhitespace,
} from './privacy-policy';

/**
 * Keeps the in-app privacy policy (`privacy-policy.ts`) from drifting off
 * `docs/privacy-policy.md`, the document a legal reviewer actually signs off
 * on. Renders neither side as markdown or React — compares plain text.
 *
 * Normalization, applied to the RAW MARKDOWN side only (the app side is
 * already plain prose — see `flattenPrivacyPolicyContent`):
 *   1. Drop every line starting with `>` — the internal
 *      "Cần bổ sung trước khi phát hành" callout, a note to whoever ships
 *      this policy, not end-user text (`privacy-policy.ts`'s doc comment
 *      states the same exclusion).
 *   2. Drop the H1 title line and the "Phiên bản đồng ý: ..." meta line —
 *      the screen renders these as its header/caption, not as body text.
 *   3. Strip bold markers (`**`), heading hashes (`#`), leading bullet
 *      markers (`- `), and markdown table separator rows (`|---|---|`).
 *   4. Turn table pipes (`|`) into spaces — a table row's cells then read as
 *      plain space-separated text, matching how `flattenPrivacyPolicyContent`
 *      joins a `PrivacyPolicyTableRow`'s three fields.
 *   5. Collapse all whitespace (including newlines — markdown soft-wraps a
 *      long bullet across two source lines) to single spaces and trim.
 *
 * What is intentionally NOT re-checked here: Markdown structure (which lines
 * were headings vs. bullets vs. table rows) — only the resulting WORD
 * SEQUENCE. That is enough to catch a changed, added, removed, or reworded
 * sentence, which is the failure mode a legal-text drift test exists for.
 */
function stripMarkdownChrome(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .replace(/^#\s+.*$/m, '')
    .replace(/^Phiên bản đồng ý:.*$/m, '')
    .replace(/\*\*/g, '')
    .replace(/^\|?\s*-{2,}[-\s|:]*$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\|/g, ' ');
}

describe('the in-app privacy policy matches docs/privacy-policy.md', () => {
  const docPath = join(__dirname, '../../../../docs/privacy-policy.md');
  const rawDoc = readFileSync(docPath, 'utf8');

  it('normalizes to the exact same word sequence as the source document', () => {
    const docText = normalizeWhitespace(stripMarkdownChrome(rawDoc));
    const appText = flattenPrivacyPolicyContent(PRIVACY_POLICY_CONTENT);

    expect(appText).toBe(docText);
  });

  it('is not accidentally empty (a regression guard on the normalization itself)', () => {
    const appText = flattenPrivacyPolicyContent(PRIVACY_POLICY_CONTENT);
    expect(appText.length).toBeGreaterThan(500);
  });

  it('never renders the internal "Cần bổ sung trước khi phát hành" dev callout', () => {
    const appText = flattenPrivacyPolicyContent(PRIVACY_POLICY_CONTENT);
    expect(appText).not.toContain('Cần bổ sung');
  });
});
