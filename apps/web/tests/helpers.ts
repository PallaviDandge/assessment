import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * A fetch stub whose response body is a stream the test drives by hand, so we
 * can assert what the UI shows before the first token, between tokens, and
 * after the stream ends or breaks.
 */
export function controllableStream(init: ResponseInit = { status: 200 }) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const enc = new TextEncoder();
  const fetchMock = vi.fn(async () =>
    new Response(body, { headers: { "content-type": "application/x-ndjson" }, ...init }),
  );
  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    /** Send one event as a complete NDJSON line. */
    push: (event: object) => act(async () => controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`))),
    /** Send raw bytes (e.g. half a line) to check buffering across chunk boundaries. */
    pushRaw: (raw: string) => act(async () => controller.enqueue(enc.encode(raw))),
    close: () => act(async () => controller.close()),
    fail: (err: Error) => act(async () => controller.error(err)),
  };
}

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const meta = (citations: { id: string; title: string }[] = []) => ({
  type: "meta",
  promptVersion: "talk@1.0.0",
  citations,
});
export const delta = (text: string) => ({ type: "delta", text });
export const done = (outcome: "ai" | "fallback" | "rule" | "partial", reason?: string) => ({
  type: "done",
  outcome,
  ...(reason ? { reason } : {}),
});
