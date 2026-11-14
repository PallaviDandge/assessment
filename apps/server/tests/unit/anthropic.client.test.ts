import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AnthropicLlmClient } from "../../src/llm/anthropic";
import { LlmInvalidOutputError } from "../../src/llm/errors";

/**
 * The adapter is the only file that touches the SDK. These tests mock the SDK
 * client so we can check that the adapter (a) never trusts a response the SDK
 * could not parse, (b) treats refusals / truncation as failures, and (c) only
 * forwards text deltas to the UI.
 */
const Schema = z.object({ greeting: z.string() });
const cfg = { model: "claude-opus-5-5", effort: "low" as const };

function sdkWith(parseResult: unknown, streamEvents: unknown[] = [], finalMessage: unknown = { stop_reason: "end_turn" }) {
  const parse = jest.fn().mockResolvedValue(parseResult);
  const stream = jest.fn().mockReturnValue({
    async *[Symbol.asyncIterator]() {
      for (const e of streamEvents) yield e;
    },
    finalMessage: jest.fn().mockResolvedValue(finalMessage),
  });
  const sdk = { beta: { messages: { parse, stream } } } as unknown as Anthropic;
  return { sdk, parse, stream };
}

const signal = new AbortController().signal;
const base = { system: "sys", messages: [{ role: "user" as const, content: "hi" }], signal };

describe("AnthropicLlmClient.generateStructured", () => {
  it("returns parsed_output and sends model, effort, schema format and abort signal", async () => {
    const { sdk, parse } = sdkWith({ stop_reason: "end_turn", parsed_output: { greeting: "hello" } });
    const out = await new AnthropicLlmClient(sdk, cfg).generateStructured({ ...base, schema: Schema });

    expect(out).toEqual({ greeting: "hello" });
    const [params, options] = parse.mock.calls[0];
    expect(params).toMatchObject({ model: "claude-opus-5-5", system: "sys", output_config: { effort: "low" } });
    expect(params.output_config.format).toBeDefined();
    expect(options).toMatchObject({ signal, maxRetries: 0 });
  });

  it.each([
    ["parsed_output is null", { stop_reason: "end_turn", parsed_output: null }],
    ["the model refused", { stop_reason: "refusal", parsed_output: null }],
    ["output was truncated", { stop_reason: "max_tokens", parsed_output: { greeting: "hel" } }],
    ["parsed output does not match the schema", { stop_reason: "end_turn", parsed_output: { greeting: 42 } }],
  ])("throws LlmInvalidOutputError when %s", async (_l, result) => {
    const { sdk } = sdkWith(result);
    await expect(
      new AnthropicLlmClient(sdk, cfg).generateStructured({ ...base, schema: Schema }),
    ).rejects.toBeInstanceOf(LlmInvalidOutputError);
  });
});

describe("AnthropicLlmClient.streamText", () => {
  it("yields only text deltas, skipping thinking and other events", async () => {
    const { sdk } = sdkWith(null, [
      { type: "message_start" },
      { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "secret" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } },
      { type: "message_stop" },
    ]);
    const out: string[] = [];
    for await (const t of new AnthropicLlmClient(sdk, cfg).streamText(base)) out.push(t);
    expect(out).toEqual(["Hel", "lo"]);
  });

  it("throws after streaming if the model refused, so the caller can mark the answer partial", async () => {
    const { sdk } = sdkWith(null, [], { stop_reason: "refusal" });
    const consume = async () => {
      for await (const _ of new AnthropicLlmClient(sdk, cfg).streamText(base)) void _;
    };
    await expect(consume()).rejects.toBeInstanceOf(LlmInvalidOutputError);
  });
});
