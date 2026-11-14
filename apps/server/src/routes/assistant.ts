import { Router } from "express";
import {
  ChatRequestSchema,
  GreetingRequestSchema,
  SummaryRequestSchema,
  type ChatRequest,
  type GreetingRequest,
  type SummaryRequest,
} from "@cb/shared";
import { validateBody } from "../middleware/validate";
import { getSummary } from "../services/summary";
import { getGreeting } from "../services/greeting";
import { runChat, type ChatDeps } from "../services/chat";

/** Handlers are thin: validated input in, service call, typed output out. */
export function assistantRouter(deps: ChatDeps): Router {
  const router = Router();

  router.post("/greeting", validateBody(GreetingRequestSchema), async (_req, res) => {
    res.json(await getGreeting(deps, res.locals.body as GreetingRequest));
  });

  router.post("/summary", validateBody(SummaryRequestSchema), async (_req, res) => {
    const { locale } = res.locals.body as SummaryRequest;
    res.json(await getSummary(deps, locale));
  });

  router.post("/chat", validateBody(ChatRequestSchema), async (_req, res) => {
    const body = res.locals.body as ChatRequest;
    res.status(200).set({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // disable proxy buffering so tokens arrive as they are produced
    });
    res.flushHeaders();

    // Operator closed the panel / navigated away: stop paying for tokens.
    const ac = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });

    for await (const event of runChat(deps, body, ac.signal)) {
      if (ac.signal.aborted) break;
      res.write(`${JSON.stringify(event)}\n`);
    }
    res.end();
  });

  return router;
}
