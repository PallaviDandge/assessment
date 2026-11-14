import { z } from "zod";

/** Environment is validated once at startup; a bad value fails fast with a clear message. */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  LLM_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}
