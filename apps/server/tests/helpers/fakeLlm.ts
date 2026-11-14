import type { LlmClient, StructuredArgs, StreamArgs } from "../../src/llm/types";

type StructuredImpl = (args: StructuredArgs<unknown>) => Promise<unknown>;
type StreamImpl = (args: StreamArgs) => AsyncIterable<string>;

/**
 * Test double for the LLM boundary. Every test controls exactly what "the model"
 * does: return valid JSON, return a broken shape, hang forever, or throw.
 */
export function fakeLlm(impl: { structured?: StructuredImpl; stream?: StreamImpl } = {}) {
  const structured = jest.fn(
    impl.structured ?? (async () => {
      throw new Error("structured not stubbed");
    }),
  );
  const stream = jest.fn(
    impl.stream ??
      (async function* () {
        throw new Error("stream not stubbed");
      }),
  );
  const client: LlmClient = {
    generateStructured: <T>(args: StructuredArgs<T>) =>
      structured(args as StructuredArgs<unknown>) as Promise<T>,
    streamText: (args: StreamArgs) => stream(args),
  };
  return { client, structured, stream };
}

/** A model call that never answers until it is aborted (simulates a stalled API). */
export function hang(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
}

/** Stream the given chunks, optionally pausing between them. */
export async function* streamOf(chunks: string[], delayMs = 0): AsyncGenerator<string> {
  for (const c of chunks) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    yield c;
  }
}

/** Stream that yields some chunks and then blows up (connection reset mid-answer). */
export async function* streamThenFail(chunks: string[], error = new Error("socket hang up")) {
  for (const c of chunks) yield c;
  throw error;
}

/** Stream that stalls before the first token until aborted. */
export async function* stalledStream(args: StreamArgs): AsyncGenerator<string> {
  await hang(args.signal);
  yield "never";
}
