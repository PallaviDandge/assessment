import { createApp } from "./app";
import { loadConfig } from "./config";
import { createAnthropicClient } from "./llm/anthropic";
import { log } from "./lib/logger";

const config = loadConfig();

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  // Not fatal by design: the app runs and every AI action degrades to its fallback.
  log.warn("startup.no_api_key", { note: "AI calls will fail and every action will use its fallback" });
}

const app = createApp({
  llm: createAnthropicClient({ model: config.ANTHROPIC_MODEL, effort: config.LLM_EFFORT }),
  timeoutMs: config.LLM_TIMEOUT_MS,
  rateLimitPerMinute: config.RATE_LIMIT_PER_MINUTE,
  corsOrigin: config.CORS_ORIGIN,
});

app.listen(config.PORT, () => {
  log.info("startup.listening", { port: config.PORT, model: config.ANTHROPIC_MODEL, timeoutMs: config.LLM_TIMEOUT_MS });
});
