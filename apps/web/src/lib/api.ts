import {
  ErrorResponseSchema,
  GreetingResponseSchema,
  QueueSchema,
  StreamEventSchema,
  SummaryResponseSchema,
  type ApprovalItem,
  type ChatRequest,
  type GreetingRequest,
  type GreetingResponse,
  type Locale,
  type StreamEvent,
  type SummaryResponse,
} from "@cb/shared";
import type { z } from "zod";
import { getSessionId } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ApiErrorKind = "network" | "rate_limited" | "invalid_response" | "http" | "aborted";

/** Every failure the UI can see is one of these, each with an operator-readable message. */
export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const MESSAGES = {
  network: "We couldn't reach the assistant. Check your connection and try again.",
  invalid: "The assistant sent an unexpected response, so it wasn't shown.",
  http: "The assistant had a problem handling that request. Please try again.",
  truncated: "The response ended unexpectedly. Please try again.",
};

async function request(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-session-id": getSessionId() },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw new ApiError("aborted", "Cancelled.");
    throw new ApiError("network", MESSAGES.network);
  }
  if (!res.ok) {
    const parsed = ErrorResponseSchema.safeParse(await res.json().catch(() => null));
    if (res.status === 429) {
      throw new ApiError("rate_limited", parsed.success ? parsed.data.error.message : "Too many requests. Please wait a moment.");
    }
    throw new ApiError("http", MESSAGES.http);
  }
  return res;
}

/** Parse + validate a JSON body. The UI never sees data that failed the shared schema. */
async function validated<S extends z.ZodType>(res: Response, schema: S): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) throw new ApiError("invalid_response", MESSAGES.invalid);
  return parsed.data;
}

export async function fetchQueue(): Promise<ApprovalItem[]> {
  return validated(await request("/api/queue", undefined), QueueSchema);
}

export async function fetchGreeting(body: GreetingRequest): Promise<GreetingResponse> {
  return validated(await request("/api/assistant/greeting", body), GreetingResponseSchema);
}

export async function fetchSummary(locale: Locale): Promise<SummaryResponse> {
  return validated(await request("/api/assistant/summary", { locale }), SummaryResponseSchema);
}

/**
 * POSTs a chat turn and calls onEvent for every NDJSON event as it arrives.
 * Each line is validated against StreamEventSchema; a bad line, a broken
 * connection, or a stream that ends without `done` all reject with ApiError.
 */
export async function streamChat(
  body: ChatRequest,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await request("/api/assistant/chat", body, signal);
  if (!res.body) throw new ApiError("invalid_response", MESSAGES.invalid);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new ApiError("invalid_response", MESSAGES.invalid);
    }
    const parsed = StreamEventSchema.safeParse(json);
    if (!parsed.success) throw new ApiError("invalid_response", MESSAGES.invalid);
    if (parsed.data.type === "done") sawDone = true;
    onEvent(parsed.data);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    handleLine(buffer + decoder.decode());
  } catch (err) {
    void reader.cancel().catch(() => undefined);
    if (err instanceof ApiError) throw err;
    if (signal?.aborted) throw new ApiError("aborted", "Cancelled.");
    throw new ApiError("network", MESSAGES.network);
  }
  if (!sawDone) throw new ApiError("invalid_response", MESSAGES.truncated);
}
