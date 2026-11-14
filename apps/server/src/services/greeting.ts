import { GreetingContentSchema, type ApprovalItem, type GreetingRequest, type GreetingResponse } from "@cb/shared";
import type { LlmClient } from "../llm/types";
import { withTimeout } from "../llm/timeout";
import { LlmInvalidOutputError, failureReason } from "../llm/errors";
import { GREETING_PROMPT } from "../prompts";
import { rankItems } from "./ranking";
import { errorMessage, log } from "../lib/logger";

export interface GreetingDeps {
  llm: LlmClient;
  queue: ApprovalItem[];
  timeoutMs: number;
  now?: () => Date;
}

/**
 * The one fact in a greeting that must be right is the pending count. Every
 * number in the text must be the real count or part of an item title
 * (e.g. "Level 2", "360°"), and the real count must be present.
 */
export function assertCountIsTruthful(greeting: string, queue: ApprovalItem[]): void {
  const count = String(queue.length);
  const allowed = new Set([count, ...queue.flatMap((q) => q.title.match(/\d+/g) ?? [])]);
  const numbers: string[] = greeting.match(/\d+/g) ?? [];
  if (!numbers.includes(count)) throw new LlmInvalidOutputError("greeting omits pending count");
  const bad = numbers.find((n) => !allowed.has(n));
  if (bad) throw new LlmInvalidOutputError(`greeting states unknown number ${bad}`);
}

export function templateGreeting(queue: ApprovalItem[], operatorName: string | undefined, now: Date): string {
  const who = operatorName ? `, ${operatorName}` : "";
  if (queue.length === 0) return `Hello${who}. Your approvals queue is clear.`;
  const top = rankItems(queue, now)[0]!.item;
  return `Hello${who}. You have ${queue.length} items pending review; "${top.title}" is the most urgent.`;
}

export async function getGreeting(deps: GreetingDeps, req: GreetingRequest): Promise<GreetingResponse> {
  const now = deps.now?.() ?? new Date();
  const base = { promptVersion: GREETING_PROMPT.version, pendingCount: deps.queue.length };
  try {
    const out = await withTimeout(
      (signal) =>
        deps.llm.generateStructured({
          system: GREETING_PROMPT.system(req.locale),
          messages: [{ role: "user", content: GREETING_PROMPT.user(deps.queue, req.operatorName, now) }],
          schema: GreetingContentSchema,
          signal,
        }),
      deps.timeoutMs,
    );
    const parsed = GreetingContentSchema.safeParse(out);
    if (!parsed.success) throw new LlmInvalidOutputError("schema mismatch");
    assertCountIsTruthful(parsed.data.greeting, deps.queue);
    return { ...base, source: "ai", greeting: parsed.data.greeting };
  } catch (err) {
    log.warn("greeting.fallback", { reason: failureReason(err), error: errorMessage(err) });
    return { ...base, source: "fallback", greeting: templateGreeting(deps.queue, req.operatorName, now) };
  }
}
