import { LlmTimeoutError } from "./errors";

/**
 * Runs `make` with an AbortSignal and rejects with LlmTimeoutError after `ms`.
 * On timeout the signal is aborted, so the HTTP request to the provider is
 * cancelled rather than left running in the background.
 */
export async function withTimeout<T>(make: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject first so the race settles with the timeout, not with the abort error it causes.
      reject(new LlmTimeoutError(ms));
      ac.abort();
    }, ms);
  });
  try {
    return await Promise.race([make(ac.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface StreamTimeouts {
  /** Max wait for the first chunk (covers connection + model think time). */
  firstChunkMs: number;
  /** Max silence between two chunks once the answer has started. */
  idleMs: number;
}

/**
 * Wraps a streaming call with two deadlines: time-to-first-chunk and an idle
 * timeout between chunks. A long answer that keeps flowing is never cut off;
 * a stalled one is aborted. Also aborts if `external` fires (client went away).
 */
export async function* withStreamTimeouts<T>(
  make: (signal: AbortSignal) => AsyncIterable<T>,
  { firstChunkMs, idleMs }: StreamTimeouts,
  external?: AbortSignal,
): AsyncGenerator<T> {
  const ac = new AbortController();
  const onExternalAbort = () => ac.abort();
  external?.addEventListener("abort", onExternalAbort, { once: true });
  if (external?.aborted) ac.abort();

  const iterator = make(ac.signal)[Symbol.asyncIterator]();
  const aborted = new Promise<never>((_, reject) => {
    ac.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  aborted.catch(() => undefined); // only observed through Promise.race

  let first = true;
  try {
    while (true) {
      const ms = first ? firstChunkMs : idleMs;
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new LlmTimeoutError(ms));
          ac.abort();
        }, ms);
      });
      let result: IteratorResult<T>;
      try {
        result = await Promise.race([iterator.next(), timeout, aborted]);
      } finally {
        clearTimeout(timer);
      }
      if (result.done) return;
      first = false;
      yield result.value;
    }
  } finally {
    external?.removeEventListener("abort", onExternalAbort);
    ac.abort();
    // Let the provider stream clean up; ignore errors from an already-failed stream.
    void Promise.resolve(iterator.return?.()).catch(() => undefined);
  }
}
