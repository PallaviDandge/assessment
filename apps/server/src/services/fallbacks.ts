import type { ApprovalItem } from "@cb/shared";
import type { PolicyChunk } from "../rag/retriever";
import { rankQueue } from "./ranking";

/**
 * Deterministic answers used when the LLM is unavailable (or deliberately not
 * called). They are in English only; that limitation is shown to the operator.
 */
const UNAVAILABLE = "The AI assistant is unavailable right now, so here is the standard guidance.";

export function talkFallback(queue: ApprovalItem[], now: Date): string {
  const summary = rankQueue(queue, now);
  const byId = new Map(queue.map((q) => [q.id, q]));
  const lines = summary.items.map(
    (s, i) => `${i + 1}. ${byId.get(s.id)?.title ?? s.id} (${s.priority} priority): ${s.reason}`,
  );
  return `${UNAVAILABLE}\n\nQueue in policy order:\n${lines.join("\n")}\n\nTry asking again in a moment for a tailored answer.`;
}

export function helpFallback(sources: PolicyChunk[]): string {
  const quoted = sources.map((s) => `[${s.id}] ${s.title}\n${s.text}`).join("\n\n");
  return `${UNAVAILABLE} These are the most relevant policy sections:\n\n${quoted}`;
}

export const HELP_NO_MATCH =
  "I couldn't find anything about that in the approval policy, so I won't guess. Try rephrasing your question, or ask your Site Supervisor.";

export const TEACH_FALLBACK = [
  UNAVAILABLE,
  "",
  "Step 1: Open the item from the Pending Approval Requests list.",
  "Step 2: Preview it with Snapshot & Control. Watch videos in full; spot-checking is not allowed.",
  "Step 3: Check accuracy against the current site configuration, completeness, and that it contains no personal data.",
  "Step 4: For camera maps, confirm restricted zones are red and no camera covers a private area. For sensor specs, compare thresholds with the HMI Panel.",
  "Step 5: Approve only if every check passes. Otherwise choose Reject and write at least one sentence telling the submitter what to fix.",
  "Step 6: Never approve your own submission; reassign it instead.",
].join("\n");

/** Split text into small chunks so fallbacks render through the same streaming path. */
export function chunkText(text: string): string[] {
  return text.match(/[^\s]+\s*/g) ?? [text];
}
