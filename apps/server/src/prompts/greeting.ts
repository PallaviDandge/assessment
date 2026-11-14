import type { ApprovalItem, Locale } from "@cb/shared";
import { languageRule, queueBlock, type PromptMeta } from "./shared";

/** greeting@1.0.0: "Replay Greeting" */
export const GREETING_PROMPT_V1 = {
  version: "greeting@1.0.0",
  system: (locale: Locale) =>
    [
      "You are the Approvals assistant. Write a warm, professional greeting of at most two short sentences (under 240 characters).",
      "State the exact number of pending items as a digit, and name the single most urgent one (safety-critical content beats everything else).",
      "No emojis, no markdown.",
      languageRule(locale),
    ].join("\n"),
  user: (queue: ApprovalItem[], operatorName: string | undefined, now: Date) =>
    [
      `Operator: ${operatorName ?? "(name unknown, do not invent one)"}`,
      `Local time (UTC): ${now.toISOString()}`,
      queueBlock(queue),
    ].join("\n"),
} satisfies PromptMeta & Record<string, unknown>;

export const GREETING_PROMPT = GREETING_PROMPT_V1;
