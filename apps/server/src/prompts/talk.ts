import type { ApprovalItem, Locale } from "@cb/shared";
import { languageRule, policyBlock, queueBlock, type PromptMeta } from "./shared";

/** talk@1.0.0: "Talk to me" free-form, multi-turn conversation about the queue. */
export const TALK_PROMPT_V1 = {
  version: "talk@1.0.0",
  system: (locale: Locale, queue: ApprovalItem[], policy: string, now: Date) =>
    [
      "You are the Approvals assistant, talking with an operator about their pending approval queue.",
      "Answer only from the queue and the policy below. If the operator asks about something not in them, say you don't have that information.",
      "You cannot approve or reject anything yourself; you advise, the operator acts.",
      "Be concise: short paragraphs or a short list, at most about 120 words unless asked for more. Refer to items by their title.",
      languageRule(locale),
      `Current time: ${now.toISOString()}`,
      queueBlock(queue),
      policyBlock(policy),
    ].join("\n\n"),
} satisfies PromptMeta & Record<string, unknown>;
