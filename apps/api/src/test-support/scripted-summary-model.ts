/** Fake summary model: answers from rules keyed on each labelled part's text, citing that part. */
export interface SummaryRule {
  when: string;
  point?: string;
  decision?: string;
  action?: { content: string; assignee?: string | null; due_date?: string | null };
}

export function scriptedSummaryModel(rules: SummaryRule[], opts: { insufficient?: boolean } = {}) {
  return (prompt: string) => {
    const blocks = prompt.split(/\n\n(?=\[[CP]\d+\])/).map((b) => /^\[([CP]\d+)\]\n([\s\S]*)$/.exec(b)).filter(Boolean) as RegExpExecArray[];
    // Second tier: one merged point citing every partial it was given.
    if (blocks[0]?.[1].startsWith('P')) {
      return JSON.stringify({
        insufficient: false,
        summary_points: [{ text: 'Tổng hợp: ' + blocks.map((b) => b[2]).join(' / '), sources: blocks.map((b) => b[1]) }],
        decisions: [],
        action_items: [],
      });
    }
    const out = { insufficient: Boolean(opts.insufficient), summary_points: [] as unknown[], decisions: [] as unknown[], action_items: [] as unknown[] };
    for (const [, label, content] of blocks) {
      for (const r of rules.filter((x) => content.includes(x.when))) {
        if (r.point) out.summary_points.push({ text: r.point, sources: [label] });
        if (r.decision) out.decisions.push({ text: r.decision, sources: [label] });
        if (r.action) out.action_items.push({ assignee: null, due_date: null, ...r.action, source: label });
      }
    }
    return JSON.stringify(out);
  };
}
