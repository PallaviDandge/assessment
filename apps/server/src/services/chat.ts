import type { ApprovalItem, ChatRequest, Citation, StreamEvent } from "@cb/shared";
import type { LlmClient } from "../llm/types";
import type { PolicyChunk, Retriever } from "../rag/retriever";
import { withStreamTimeouts } from "../llm/timeout";
import { LlmInvalidOutputError, failureReason } from "../llm/errors";
import { PROMPTS } from "../prompts";
import { HELP_NO_MATCH, TEACH_FALLBACK, chunkText, helpFallback, talkFallback } from "./fallbacks";
import { errorMessage, log } from "../lib/logger";

export interface ChatDeps {
  llm: LlmClient;
  queue: ApprovalItem[];
  retriever: Retriever;
  policy: string;
  timeoutMs: number;
  now?: () => Date;
}

interface Plan {
  promptVersion: string;
  citations: Citation[];
  /** null = answer deterministically without calling the model. */
  system: string | null;
  fallback: string;
}

function plan(deps: ChatDeps, req: ChatRequest, now: Date): Plan {
  const { mode, locale, messages } = req;
  switch (mode) {
    case "talk":
      return {
        promptVersion: PROMPTS.talk.version,
        citations: [],
        system: PROMPTS.talk.system(locale, deps.queue, deps.policy, now),
        fallback: talkFallback(deps.queue, now),
      };
    case "teach":
      return {
        promptVersion: PROMPTS.teach.version,
        citations: [],
        system: PROMPTS.teach.system(locale, deps.queue, deps.policy),
        fallback: TEACH_FALLBACK,
      };
    case "help": {
      // Retrieve on the latest question, plus the previous user turn for follow-ups like "and for videos?"
      const userTurns = messages.filter((m) => m.role === "user").slice(-2);
      const sources: PolicyChunk[] = deps.retriever.retrieve(userTurns.map((m) => m.content).join(" "), 3);
      const citations = sources.map(({ id, title }) => ({ id, title }));
      if (sources.length === 0) {
        return { promptVersion: PROMPTS.help.version, citations, system: null, fallback: HELP_NO_MATCH };
      }
      return {
        promptVersion: PROMPTS.help.version,
        citations,
        system: PROMPTS.help.system(locale, sources),
        fallback: helpFallback(sources),
      };
    }
  }
}

/**
 * Produces the NDJSON event stream for one chat turn.
 * Guarantees: `meta` first, exactly one `done` last, and never throws, so the
 * route can't end in a raw 500 halfway through a stream.
 */
export async function* runChat(deps: ChatDeps, req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const now = deps.now?.() ?? new Date();
  const p = plan(deps, req, now);
  yield { type: "meta", promptVersion: p.promptVersion, citations: p.citations };

  if (p.system === null) {
    for (const text of chunkText(p.fallback)) yield { type: "delta", text };
    yield { type: "done", outcome: "rule", reason: "no_policy_match" };
    return;
  }

  const system = p.system;
  let started = false;
  try {
    const stream = withStreamTimeouts(
      (s) => deps.llm.streamText({ system, messages: req.messages, signal: s }),
      { firstChunkMs: deps.timeoutMs, idleMs: deps.timeoutMs },
      signal,
    );
    for await (const text of stream) {
      // Don't count leading whitespace as "the answer started".
      if (!started && text.trim() === "") continue;
      started = true;
      yield { type: "delta", text };
    }
    if (!started) throw new LlmInvalidOutputError("empty answer");
    log.info("chat.ai", { mode: req.mode, promptVersion: p.promptVersion });
    yield { type: "done", outcome: "ai" };
  } catch (err) {
    const reason = failureReason(err);
    log.warn("chat.degraded", { mode: req.mode, reason, started, error: errorMessage(err) });
    if (signal?.aborted) return; // client is gone; nothing to send
    if (started) {
      // Keep what the operator already read; the UI marks it as interrupted.
      yield { type: "done", outcome: "partial", reason };
      return;
    }
    for (const text of chunkText(p.fallback)) yield { type: "delta", text };
    yield { type: "done", outcome: "fallback", reason };
  }
}
