import request from "supertest";
import {
  ErrorResponseSchema,
  GreetingResponseSchema,
  StreamEventSchema,
  SummaryResponseSchema,
  type StreamEvent,
} from "@cb/shared";
import { createApp } from "../../src/app";
import { fakeLlm, hang, stalledStream, streamOf } from "../helpers/fakeLlm";

/**
 * End-to-end through Express: routing, Zod request validation, the service,
 * the fallback path and the wire format. Only the LLM boundary is faked.
 */
const TIMEOUT_MS = 60;

function app(llm = fakeLlm(), opts: { rateLimitPerMinute?: number } = {}) {
  return createApp({ llm: llm.client, timeoutMs: TIMEOUT_MS, rateLimitPerMinute: opts.rateLimitPerMinute ?? 100 });
}

/** Read an NDJSON body and validate every line against the shared contract. */
function ndjson(res: request.Response): StreamEvent[] {
  // rawText() below uses a custom parser, whose result lands on res.body.
  return (res.body as string)
    .split("\n")
    .filter(Boolean)
    .map((line) => StreamEventSchema.parse(JSON.parse(line)));
}

const rawText = (req: request.Test) =>
  req.buffer(true).parse((res, cb) => {
    let body = "";
    res.setEncoding("utf8");
    res.on("data", (c: string) => (body += c));
    res.on("end", () => cb(null, body));
  });

const validSummary = {
  headline: "4 pending; start with safety.",
  items: ["apr-003", "apr-001", "apr-004", "apr-002"].map((id, i) => ({
    id,
    priority: i === 0 ? "high" : "medium",
    reason: "because",
    suggestedAction: "review",
  })),
};

describe("POST /api/assistant/summary", () => {
  it("success: returns the validated AI summary", async () => {
    const llm = fakeLlm({ structured: async () => validSummary });
    const res = await request(app(llm)).post("/api/assistant/summary").send({ locale: "en" });

    expect(res.status).toBe(200);
    const body = SummaryResponseSchema.parse(res.body);
    expect(body.source).toBe("ai");
    expect(body.summary.items[0]!.id).toBe("apr-003");
  });

  it("timeout: a stalled model still yields 200 with the deterministic fallback, within budget", async () => {
    const llm = fakeLlm({ structured: (a) => hang(a.signal) });
    const started = Date.now();
    const res = await request(app(llm)).post("/api/assistant/summary").send({});

    expect(Date.now() - started).toBeLessThan(TIMEOUT_MS + 1000);
    expect(res.status).toBe(200);
    const body = SummaryResponseSchema.parse(res.body);
    expect(body).toMatchObject({ source: "fallback", locale: "en" });
    expect(body.notice).toBeTruthy();
  });

  it("broken AI response shape never reaches the client", async () => {
    const llm = fakeLlm({ structured: async () => ({ summary: "free text the model made up" }) });
    const res = await request(app(llm)).post("/api/assistant/summary").send({});
    expect(res.status).toBe(200);
    expect(SummaryResponseSchema.parse(res.body).source).toBe("fallback");
  });

  it("rejects an invalid request with a 400 JSON error, before calling the model", async () => {
    const llm = fakeLlm();
    const res = await request(app(llm)).post("/api/assistant/summary").send({ locale: "klingon" });
    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe("invalid_request");
    expect(llm.structured).not.toHaveBeenCalled();
  });
});

describe("POST /api/assistant/greeting", () => {
  it("success and fallback both return a schema-valid greeting with the live count", async () => {
    const ok = fakeLlm({ structured: async () => ({ greeting: "Hi Riya, 4 items are waiting." }) });
    const down = fakeLlm({ structured: async () => Promise.reject(new Error("401 invalid x-api-key")) });

    const a = GreetingResponseSchema.parse(
      (await request(app(ok)).post("/api/assistant/greeting").send({ operatorName: "Riya" })).body,
    );
    const b = GreetingResponseSchema.parse((await request(app(down)).post("/api/assistant/greeting").send({})).body);

    expect(a).toMatchObject({ source: "ai", pendingCount: 4 });
    expect(b).toMatchObject({ source: "fallback", pendingCount: 4 });
  });
});

describe("POST /api/assistant/chat (NDJSON stream)", () => {
  const body = { mode: "talk", messages: [{ role: "user", content: "which first?" }] };

  it("success: streams meta, token deltas and done(ai) as NDJSON", async () => {
    const llm = fakeLlm({ stream: () => streamOf(["Open ", "the safety ", "spec."], 5) });
    const res = await rawText(request(app(llm)).post("/api/assistant/chat").send(body));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/x-ndjson/);
    const events = ndjson(res);
    expect(events[0]?.type).toBe("meta");
    expect(events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text)).toEqual([
      "Open ",
      "the safety ",
      "spec.",
    ]);
    expect(events.at(-1)).toEqual({ type: "done", outcome: "ai" });
  });

  it("timeout: a stalled stream degrades to fallback text with done(fallback, timeout), still 200", async () => {
    const llm = fakeLlm({ stream: stalledStream });
    const res = await rawText(request(app(llm)).post("/api/assistant/chat").send(body));

    expect(res.status).toBe(200);
    const events = ndjson(res);
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "fallback", reason: "timeout" });
    expect(events.some((e) => e.type === "delta")).toBe(true);
  });

  it("help: answers outside the policy are refused without calling the model", async () => {
    const llm = fakeLlm();
    const res = await rawText(
      request(app(llm))
        .post("/api/assistant/chat")
        .send({ mode: "help", messages: [{ role: "user", content: "best pizza in Rome?" }] }),
    );
    expect(ndjson(res).at(-1)).toMatchObject({ outcome: "rule" });
    expect(llm.stream).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown mode", { mode: "joke", messages: [{ role: "user", content: "hi" }] }],
    ["empty history", { mode: "talk", messages: [] }],
    ["last turn is not the user", { mode: "talk", messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }],
    ["oversized message", { mode: "talk", messages: [{ role: "user", content: "x".repeat(2001) }] }],
  ])("400 for %s", async (_l, payload) => {
    const res = await request(app()).post("/api/assistant/chat").send(payload);
    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe("invalid_request");
  });
});

describe("rate limiting", () => {
  it("throttles per session id with a JSON 429, without affecting other sessions", async () => {
    const llm = fakeLlm({ structured: async () => validSummary });
    const server = app(llm, { rateLimitPerMinute: 2 });
    const send = (sid: string) => request(server).post("/api/assistant/summary").set("x-session-id", sid).send({});

    expect((await send("session-a")).status).toBe(200);
    expect((await send("session-a")).status).toBe(200);
    const limited = await send("session-a");
    expect(limited.status).toBe(429);
    const err = ErrorResponseSchema.parse(limited.body).error;
    expect(err.code).toBe("rate_limited");
    expect(err.retryAfterSeconds).toBeGreaterThan(0);

    expect((await send("session-b")).status).toBe(200);
  });
});

describe("robustness", () => {
  it("GET /api/queue returns the seeded queue", async () => {
    const res = await request(app()).get("/api/queue");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
  });

  it("malformed JSON gets a JSON 400, not an HTML error page", async () => {
    const res = await request(app())
      .post("/api/assistant/summary")
      .set("content-type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  it("unknown routes get a JSON 404", async () => {
    const res = await request(app()).get("/api/nope");
    expect(res.status).toBe(404);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe("not_found");
  });
});
