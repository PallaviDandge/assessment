import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LlmInvalidOutputError } from "./errors";
import type { LlmClient, StreamArgs, StructuredArgs } from "./types";

export interface AnthropicConfig {
  model: string;
  /** Opus 5.5 always thinks; effort is the latency/depth control. */
  effort: "low" | "medium" | "high";
}

/**
 * Server-side only. The API key is read by the SDK from ANTHROPIC_API_KEY in
 * the server process and never leaves it.
 *
 * - Retries are disabled (maxRetries: 0): the 8s budget is owned by our own
 *   timeout wrapper, and an SDK retry loop would silently blow through it.
 * - Server-side refusal fallbacks are enabled ("default" routing), so a policy
 *   decline is re-run on a fallback model inside the same call.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_TOKENS = 4096; // includes adaptive thinking; answers here are short

export class AnthropicLlmClient implements LlmClient {
  constructor(
    private readonly sdk: Anthropic,
    private readonly cfg: AnthropicConfig,
  ) {}

  async generateStructured<T>({ system, messages, schema, signal }: StructuredArgs<T>): Promise<T> {
    const res = await this.sdk.beta.messages.parse(
      {
        model: this.cfg.model,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: this.cfg.effort, format: betaZodOutputFormat(schema) },
      },
      { signal, maxRetries: 0 },
    );

    if (res.stop_reason === "refusal") throw new LlmInvalidOutputError("refusal");
    if (res.stop_reason === "max_tokens") throw new LlmInvalidOutputError("truncated");
    if (res.parsed_output == null) throw new LlmInvalidOutputError("unparseable");

    // Belt and braces: never hand anything to the caller that has not passed our schema.
    const checked = schema.safeParse(res.parsed_output);
    if (!checked.success) throw new LlmInvalidOutputError("schema mismatch");
    return checked.data;
  }

  async *streamText({ system, messages, signal }: StreamArgs): AsyncGenerator<string> {
    const stream = this.sdk.beta.messages.stream(
      {
        model: this.cfg.model,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: this.cfg.effort },
      },
      { signal, maxRetries: 0 },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new LlmInvalidOutputError("refusal");
  }
}

export function createAnthropicClient(cfg: AnthropicConfig): AnthropicLlmClient {
  return new AnthropicLlmClient(new Anthropic(), cfg);
}
