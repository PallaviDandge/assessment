import { createApp } from "./app";
import { hasCredential, llmConnection, loadConfig } from "./config";
import { createAnthropicClient } from "./llm/anthropic";
import { log } from "./lib/logger";

const config = loadConfig();
const conn = llmConnection(config);

if (!hasCredential(config)) {
  // Not fatal by design: the app runs and every AI action degrades to its fallback.
  log.warn("startup.no_api_key", {
    provider: config.LLM_PROVIDER,
    expected: config.LLM_PROVIDER === "openrouter" ? "OPENROUTER_API_KEY" : "ANTHROPIC_API_KEY",
    note: "AI calls will fail and every action will use its fallback",
  });
}
if (config.LLM_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY?.startsWith("sk-or-")) {
  log.warn("startup.key_mismatch", { note: "ANTHROPIC_API_KEY looks like an OpenRouter key; set LLM_PROVIDER=openrouter and OPENROUTER_API_KEY" });
}

const app = createApp({
  llm: createAnthropicClient(conn, { effort: config.LLM_EFFORT, maxTokens: config.LLM_MAX_TOKENS }),
  timeoutMs: config.LLM_TIMEOUT_MS,
  rateLimitPerMinute: config.RATE_LIMIT_PER_MINUTE,
  corsOrigin: config.CORS_ORIGIN,
});

app.listen(config.PORT, () => {
  log.info("startup.listening", {
    port: config.PORT,
    provider: config.LLM_PROVIDER,
    model: conn.model,
    timeoutMs: config.LLM_TIMEOUT_MS,
  });
});
