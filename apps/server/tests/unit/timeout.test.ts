import { withTimeout, withStreamTimeouts } from "../../src/llm/timeout";
import { LlmTimeoutError } from "../../src/llm/errors";
import { hang, streamOf } from "../helpers/fakeLlm";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe("withTimeout", () => {
  it("resolves with the value when the call finishes in time", async () => {
    await expect(withTimeout(async () => "ok", 100)).resolves.toBe("ok");
  });

  it("rejects with LlmTimeoutError and aborts the underlying call when it stalls", async () => {
    let seenSignal: AbortSignal | undefined;
    const p = withTimeout((signal) => {
      seenSignal = signal;
      return hang(signal);
    }, 30);
    await expect(p).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(seenSignal?.aborted).toBe(true);
  });

  it("passes through non-timeout errors unchanged", async () => {
    const boom = new Error("401 invalid x-api-key");
    await expect(withTimeout(async () => Promise.reject(boom), 100)).rejects.toBe(boom);
  });
});

describe("withStreamTimeouts", () => {
  it("yields every chunk from a healthy stream", async () => {
    const chunks = await collect(
      withStreamTimeouts(() => streamOf(["a", "b", "c"], 5), { firstChunkMs: 1000, idleMs: 1000 }),
    );
    expect(chunks).toEqual(["a", "b", "c"]);
  });

  it("times out if the first chunk never arrives", async () => {
    let seen: AbortSignal | undefined;
    const it = withStreamTimeouts(
      (signal) => {
        seen = signal;
        return (async function* () {
          await hang(signal);
          yield "x";
        })();
      },
      { firstChunkMs: 30, idleMs: 1000 },
    );
    await expect(collect(it)).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(seen?.aborted).toBe(true);
  });

  it("times out when the stream goes idle mid-answer, after yielding what it had", async () => {
    const received: string[] = [];
    const it = withStreamTimeouts(
      (signal) =>
        (async function* () {
          yield "first ";
          await hang(signal);
        })(),
      { firstChunkMs: 1000, idleMs: 30 },
    );
    await expect(
      (async () => {
        for await (const c of it) received.push(c);
      })(),
    ).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(received).toEqual(["first "]);
  });

  it("aborts the underlying stream when the caller's signal aborts (client disconnected)", async () => {
    const external = new AbortController();
    let seen: AbortSignal | undefined;
    const it = withStreamTimeouts(
      (signal) => {
        seen = signal;
        return (async function* () {
          yield "a";
          await hang(signal);
        })();
      },
      { firstChunkMs: 1000, idleMs: 1000 },
      external.signal,
    );
    const iter = it[Symbol.asyncIterator]();
    await iter.next();
    const pending = iter.next();
    external.abort();
    await expect(pending).rejects.toBeDefined();
    expect(seen?.aborted).toBe(true);
  });
});
