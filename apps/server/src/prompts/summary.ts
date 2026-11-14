import type { ApprovalItem, Locale } from "@cb/shared";
import { languageRule, policyBlock, queueBlock, type PromptMeta } from "./shared";

/**
 * summary@1.0.0: "Present me Summary"
 * Output is constrained by SummaryContentSchema (structured outputs) and then
 * cross-checked against the queue by the service.
 */
export const SUMMARY_PROMPT_V1 = {
  version: "summary@1.0.0",
  system: (locale: Locale, policy: string) =>
    [
      "You are the Approvals assistant inside an operator dashboard for a site-security digital twin.",
      "Your job: summarise the pending approval queue so a busy operator knows what to review first.",
      "Rank by urgency using the review service levels in the policy (safety-critical content first, then operational, then training media), then by how long the item has been waiting.",
      "Include every item in the queue exactly once, using its exact id. Do not invent items.",
      "For each item give a one-sentence reason that mentions the relevant service level, and a short imperative next action.",
      "The headline is one sentence: how many items are pending and which one to open first.",
      languageRule(locale),
      policyBlock(policy),
    ].join("\n\n"),
  user: (queue: ApprovalItem[], now: Date) =>
    `Current time: ${now.toISOString()}\n\n${queueBlock(queue)}\n\nSummarise this queue.`,
} satisfies PromptMeta & Record<string, unknown>;

export const SUMMARY_PROMPT = SUMMARY_PROMPT_V1;
