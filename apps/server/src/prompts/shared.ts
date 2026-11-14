import { LOCALES, type ApprovalItem, type Locale } from "@cb/shared";

export interface PromptMeta {
  /** Bumped on every wording change; returned to the client and logged with each call. */
  version: string;
}

export const languageName = (locale: Locale): string => LOCALES[locale];

export function languageRule(locale: Locale): string {
  return `Write every sentence for the operator in ${languageName(locale)}. Keep item titles and ids exactly as given.`;
}

/** Compact, deterministic serialisation of the queue for prompts. */
export function queueBlock(queue: ApprovalItem[]): string {
  const rows = queue.map(
    (q) =>
      `- id=${q.id} | "${q.title}" | type=${q.type} | submitted by ${q.submittedBy} at ${q.submittedAt} | location: ${q.location} | ${q.description}`,
  );
  return `<approval_queue count="${queue.length}">\n${rows.join("\n")}\n</approval_queue>`;
}

export function policyBlock(policy: string): string {
  return `<approval_policy>\n${policy.trim()}\n</approval_policy>`;
}
