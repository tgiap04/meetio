export interface Rule {
  /** Emit when a chunk's text contains this. */
  when: string;
  entities: { name: string; type: string; description?: string }[];
  relations?: { source: string; target: string; relationship: string; confidence?: number }[];
}

/** Fake extraction model: answers each labelled chunk from rules keyed on its text, citing the right label. */
export function scriptedModel(rules: Rule[]) {
  return (prompt: string) => {
    const entities: unknown[] = [];
    const relations: unknown[] = [];
    for (const block of prompt.split(/\n\n(?=\[C\d+\])/)) {
      const [, label, content] = /^\[(C\d+)\]\n([\s\S]*)$/.exec(block) ?? [];
      for (const rule of rules.filter((r) => content?.includes(r.when))) {
        rule.entities.forEach((e) => entities.push({ ...e, chunks: [label] }));
        (rule.relations ?? []).forEach((r) => relations.push({ confidence: 0.9, ...r, chunk: label }));
      }
    }
    return JSON.stringify({ entities, relations });
  };
}
