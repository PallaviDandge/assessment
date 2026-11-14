import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LlmInvalidOutputError } from "./errors";
import type { LlmClient, StreamArgs, StructuredArgs } from "./types";
import type { LlmConnection } from "../config";

export interface AnthropicConfig {
  model: string;
  /** Opus 5.5 always thinks; effort is the latency/depth control. */
  effort: "low" | "medium" | "high";
  /** Includes adaptive thinking; answers here are short. */
  maxTokens?: number;
  /**
   * Anthropic server-side refusal fallbacks ("default" routing): a policy
   * decline is re-run on a fallback model inside the same call. Direct
   * Anthropic API only; proxies such as OpenRouter don't forward the beta.
   */
  serverFallbacks?: boolean;
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Server-side only. Credentials are read in the server process and never leave it.
 * Retries are disabled (maxRetries: 0): the 8s budget is owned by our own
 * timeout wrapper, and an SDK retry loop would silently blow through it.
 */
export class AnthropicLlmClient implements LlmClient {
  constructor(
    private readonly sdk: Anthropic,
    private readonly cfg: AnthropicConfig,
  ) {}

  private common() {
    return {
      model: this.cfg.model,
      max_tokens: this.cfg.maxTokens ?? 4096,
      ...((this.cfg.serverFallbacks ?? true) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    };
  }

  async generateStructured<T>({ system, messages, schema, signal }: StructuredArgs<T>): Promise<T> {
    const res = await this.sdk.beta.messages.parse(
      {
        ...this.common(),
        system,
        messages,
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
      { ...this.common(), system, messages, output_config: { effort: this.cfg.effort } },
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

export function createAnthropicClient(
  conn: LlmConnection,
  opts: { effort: AnthropicConfig["effort"]; maxTokens: number },
): AnthropicLlmClient {
  const sdk = conn.baseURL
    ? // OpenRouter: Bearer auth; apiKey: null stops the SDK sending an x-api-key header.
      new Anthropic({ baseURL: conn.baseURL, apiKey: null, authToken: conn.authToken ?? null })
    : new Anthropic();
  return new AnthropicLlmClient(sdk, {
    model: conn.model,
    effort: opts.effort,
    maxTokens: opts.maxTokens,
    serverFallbacks: conn.serverFallbacks,
  });
}
