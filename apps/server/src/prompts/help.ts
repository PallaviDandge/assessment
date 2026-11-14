import type { Locale } from "@cb/shared";
import type { PolicyChunk } from "../rag/retriever";
import { languageRule, type PromptMeta } from "./shared";

/**
 * help@1.0.0: "Help me", grounded Q&A.
 * Only the retrieved policy sections are given to the model, so it cannot
 * quietly answer from general knowledge.
 */
export const HELP_PROMPT_V1 = {
  version: "help@1.0.0",
  system: (locale: Locale, sources: PolicyChunk[]) =>
    [
      "You answer operational questions for an approvals operator using ONLY the policy excerpts below.",
      "Cite the section id in square brackets after each claim, for example [P3].",
      'If the excerpts do not answer the question, reply exactly that the policy does not cover it and suggest asking the Site Supervisor. Do not use outside knowledge.',
      "Be brief: 1 to 4 sentences.",
      languageRule(locale),
      "<policy_excerpts>",
      ...sources.map((s) => `[${s.id}] ${s.title}\n${s.text}`),
      "</policy_excerpts>",
    ].join("\n"),
} satisfies PromptMeta & Record<string, unknown>;
