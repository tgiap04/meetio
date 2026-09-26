/** Gemini structured-output schema and validator for the summarize step (phase-14 step 1). */

export interface CitedLine {
  text: string;
  /** Labels as sent to the model (C1…, or P1… in the second tier). */
  labels: string[];
}

export interface ExtractedAction {
  content: string;
  /** Only a name the transcript states for this task; never inferred. */
  assignee: string | null;
  /** YYYY-MM-DD, already resolved against the meeting date; null when not stated clearly. */
  due_date: string | null;
  label: string;
}

export interface ParsedSummary {
  insufficient: boolean;
  points: CitedLine[];
  decisions: CitedLine[];
  actions: ExtractedAction[];
}

const CITED = { type: 'OBJECT', properties: { text: { type: 'STRING' }, sources: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['text', 'sources'] };

export const SUMMARY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    insufficient: { type: 'BOOLEAN' },
    summary_points: { type: 'ARRAY', items: CITED },
    decisions: { type: 'ARRAY', items: CITED },
    action_items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          content: { type: 'STRING' },
          assignee: { type: 'STRING', nullable: true },
          due_date: { type: 'STRING', nullable: true },
          source: { type: 'STRING' },
        },
        required: ['content', 'source'],
      },
    },
  },
  required: ['insufficient', 'summary_points', 'decisions', 'action_items'],
};

export class SummarySchemaError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, field: string): string => {
  if (typeof v !== 'string') throw new SummarySchemaError(`${field} không phải chuỗi`);
  return v.trim();
};
const optionalText = (v: unknown, field: string): string | null => (v === undefined || v === null ? null : text(v, field) || null);

/** A real calendar date in YYYY-MM-DD; anything else ("thứ Sáu", "2026-02-30") is dropped, not guessed. */
export function validDate(v: string | null): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/**
 * Structural problems throw `SummarySchemaError` (the caller retries). Content that cannot be
 * traced is dropped instead: a line or task without a known source label (US-31, "Tóm tắt bịa nội
 * dung" risk).
 */
export function parseSummary(raw: string, labels: readonly string[]): ParsedSummary {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new SummarySchemaError('không phải JSON hợp lệ');
  }
  if (!isObject(v) || typeof v.insufficient !== 'boolean' || ![v.summary_points, v.decisions, v.action_items].every(Array.isArray)) {
    throw new SummarySchemaError('thiếu trường bắt buộc');
  }
  const known = new Set(labels);
  const cited = (items: unknown[], field: string): CitedLine[] =>
    items.flatMap((item) => {
      if (!isObject(item) || !Array.isArray(item.sources)) throw new SummarySchemaError(`${field} sai cấu trúc`);
      const line = text(item.text, `${field}.text`);
      const sources = [...new Set(item.sources.map((s) => text(s, `${field}.sources[]`)))].filter((s) => known.has(s));
      return line && sources.length > 0 ? [{ text: line, labels: sources }] : [];
    });

  const actions = (v.action_items as unknown[]).flatMap((item): ExtractedAction[] => {
    if (!isObject(item)) throw new SummarySchemaError('action_items sai cấu trúc');
    const content = text(item.content, 'action.content');
    const label = text(item.source, 'action.source');
    if (!content || !known.has(label)) return [];
    return [{ content: content.slice(0, 500), assignee: optionalText(item.assignee, 'action.assignee'), due_date: validDate(optionalText(item.due_date, 'action.due_date')), label }];
  });

  return {
    insufficient: v.insufficient as boolean,
    points: cited(v.summary_points as unknown[], 'summary_points'),
    decisions: cited(v.decisions as unknown[], 'decisions'),
    actions,
  };
}
