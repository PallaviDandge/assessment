export class LlmTimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`LLM call exceeded ${ms}ms`);
    this.name = "LlmTimeoutError";
  }
}

/** The model answered, but not with something we are willing to show. */
export class LlmInvalidOutputError extends Error {
  constructor(reason: string) {
    super(`LLM output rejected: ${reason}`);
    this.name = "LlmInvalidOutputError";
  }
}

/** Maps any failure to a short, log-friendly reason code (no secrets, no stack). */
export function failureReason(err: unknown): "timeout" | "invalid_output" | "llm_error" {
  if (err instanceof LlmTimeoutError) return "timeout";
  if (err instanceof LlmInvalidOutputError) return "invalid_output";
  return "llm_error";
}
