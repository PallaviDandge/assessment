import { z } from "zod";

/** Environment is validated once at startup; a bad value fails fast with a clear message. */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  /**
   * anthropic  = Claude API directly (ANTHROPIC_API_KEY)
   * openrouter = Claude via OpenRouter's Anthropic-compatible endpoint (OPENROUTER_API_KEY).
   * Same Anthropic SDK in both cases; only base URL, auth and model id differ.
   */
  LLM_PROVIDER: z.enum(["anthropic", "openrouter"]).default("anthropic"),
  ANTHROPIC_MODEL: z.string().trim().optional().transform((v) => v || undefined),
  LLM_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  LLM_MAX_TOKENS: z.coerce.number().int().min(256).default(4096),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}

export interface LlmConnection {
  baseURL: string | undefined;
  /** Sent as a Bearer token (OpenRouter). Undefined = SDK default credential resolution. */
  authToken: string | undefined;
  model: string;
  /** Anthropic-only beta; not forwarded by proxies, so off for OpenRouter. */
  serverFallbacks: boolean;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

export function llmConnection(config: Config, env: NodeJS.ProcessEnv = process.env): LlmConnection {
  if (config.LLM_PROVIDER === "openrouter") {
    return {
      baseURL: OPENROUTER_BASE_URL,
      authToken: env.OPENROUTER_API_KEY || undefined,
      model: config.ANTHROPIC_MODEL ?? "anthropic/claude-opus-5.5",
      serverFallbacks: false,
    };
  }
  return {
    baseURL: undefined,
    authToken: undefined,
    model: config.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    serverFallbacks: true,
  };
}

/** Whether a credential for the chosen provider is configured at all (never logs the value). */
export function hasCredential(config: Config, env: NodeJS.ProcessEnv = process.env): boolean {
  return config.LLM_PROVIDER === "openrouter"
    ? Boolean(env.OPENROUTER_API_KEY)
    : Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}
