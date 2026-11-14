import express from "express";
import cors from "cors";
import type { LlmClient } from "./llm/types";
import { loadPolicy, loadQueue } from "./data/queue";
import { createRetriever } from "./rag/retriever";
import { aiRateLimiters } from "./middleware/rateLimit";
import { errorHandler, notFound } from "./middleware/errors";
import { assistantRouter } from "./routes/assistant";

export interface AppOptions {
  llm: LlmClient;
  timeoutMs: number;
  rateLimitPerMinute: number;
  corsOrigin?: string;
}

/** Composition root. Everything with side effects is injected, so tests can build the app with fakes. */
export function createApp({ llm, timeoutMs, rateLimitPerMinute, corsOrigin }: AppOptions) {
  const queue = loadQueue();
  const policy = loadPolicy();
  const deps = { llm, queue, policy, retriever: createRetriever(policy), timeoutMs };

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(
    cors({
      origin: corsOrigin ?? "http://localhost:3000",
      allowedHeaders: ["content-type", "x-session-id"],
      exposedHeaders: ["RateLimit", "RateLimit-Policy", "Retry-After"],
    }),
  );
  app.use(express.json({ limit: "64kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/queue", (_req, res) => {
    res.json(queue);
  });
  app.use("/api/assistant", ...aiRateLimiters(rateLimitPerMinute), assistantRouter(deps));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
