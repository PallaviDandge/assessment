import {
  SummaryContentSchema,
  type ApprovalItem,
  type Locale,
  type SummaryContent,
  type SummaryResponse,
} from "@cb/shared";
import type { LlmClient } from "../llm/types";
import { withTimeout } from "../llm/timeout";
import { LlmInvalidOutputError, failureReason } from "../llm/errors";
import { SUMMARY_PROMPT } from "../prompts";
import { rankQueue } from "./ranking";
import { errorMessage, log } from "../lib/logger";

export interface SummaryDeps {
  llm: LlmClient;
  queue: ApprovalItem[];
  policy?: string;
  timeoutMs: number;
  now?: () => Date;
}

/**
 * Schema validity is not enough: a well-formed summary that drops, duplicates
 * or invents an approval is still wrong and could make an operator miss work.
 */
export function assertCoversQueue(summary: SummaryContent, queue: ApprovalItem[]): void {
  const expected = new Set(queue.map((q) => q.id));
  const seen = new Set<string>();
  for (const item of summary.items) {
    if (!expected.has(item.id)) throw new LlmInvalidOutputError(`unknown id ${item.id}`);
    if (seen.has(item.id)) throw new LlmInvalidOutputError(`duplicate id ${item.id}`);
    seen.add(item.id);
  }
  if (seen.size !== expected.size) throw new LlmInvalidOutputError("summary does not cover the whole queue");
}

export async function getSummary(deps: SummaryDeps, locale: Locale): Promise<SummaryResponse> {
  const now = deps.now?.() ?? new Date();
  const base = { promptVersion: SUMMARY_PROMPT.version, generatedAt: now.toISOString(), locale };

  try {
    const raw = await withTimeout(
      (signal) =>
        deps.llm.generateStructured({
          system: SUMMARY_PROMPT.system(locale, deps.policy ?? ""),
          messages: [{ role: "user", content: SUMMARY_PROMPT.user(deps.queue, now) }],
          schema: SummaryContentSchema,
          signal,
        }),
      deps.timeoutMs,
    );
    // Re-validate here as well: the LlmClient is an interface, and this
    // service must be safe even with an adapter that forgets to validate.
    const parsed = SummaryContentSchema.safeParse(raw);
    if (!parsed.success) throw new LlmInvalidOutputError("schema mismatch");
    assertCoversQueue(parsed.data, deps.queue);

    log.info("summary.ai", { promptVersion: SUMMARY_PROMPT.version, locale });
    return { ...base, source: "ai", summary: parsed.data };
  } catch (err) {
    log.warn("summary.fallback", { reason: failureReason(err), error: errorMessage(err) });
    return {
      ...base,
      source: "fallback",
      summary: rankQueue(deps.queue, now),
      notice: "AI summary is unavailable right now, so this is the standard policy-based ranking (in English).",
    };
  }
}
