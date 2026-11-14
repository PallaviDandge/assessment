import { readFileSync } from "fs";
import { join } from "path";
import { StreamEventSchema, type ChatRequest, type StreamEvent } from "@cb/shared";
import { runChat } from "../../src/services/chat";
import { createRetriever } from "../../src/rag/retriever";
import { loadQueue } from "../../src/data/queue";
import { PROMPTS } from "../../src/prompts";
import { fakeLlm, streamOf, streamThenFail, stalledStream } from "../helpers/fakeLlm";

const policy = readFileSync(join(__dirname, "../../src/data/policy.md"), "utf8");
const retriever = createRetriever(policy);
const queue = loadQueue();

function deps(llm: ReturnType<typeof fakeLlm>["client"], timeoutMs = 1000) {
  return { llm, queue, retriever, policy, timeoutMs };
}

function req(mode: ChatRequest["mode"], text: string, locale: ChatRequest["locale"] = "en"): ChatRequest {
  return { mode, locale, messages: [{ role: "user", content: text }] };
}

async function run(d: ReturnType<typeof deps>, r: ChatRequest): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of runChat(d, r)) events.push(StreamEventSchema.parse(e));
  return events;
}

const text = (events: StreamEvent[]) =>
  events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
const done = (events: StreamEvent[]) => events.at(-1) as Extract<StreamEvent, { type: "done" }>;

describe("runChat: stream protocol", () => {
  it("emits meta first, then the model's tokens as separate deltas, then done(ai)", async () => {
    const llm = fakeLlm({ stream: () => streamOf(["Start ", "with ", "apr-003."]) });
    const events = await run(deps(llm.client), req("talk", "what first?"));

    expect(events[0]).toEqual({ type: "meta", promptVersion: PROMPTS.talk.version, citations: [] });
    expect(events.filter((e) => e.type === "delta")).toHaveLength(3);
    expect(text(events)).toBe("Start with apr-003.");
    expect(done(events)).toEqual({ type: "done", outcome: "ai" });
  });

  it("passes the full multi-turn history to the model (talk mode)", async () => {
    const llm = fakeLlm({ stream: () => streamOf(["ok"]) });
    const history: ChatRequest = {
      mode: "talk",
      locale: "es",
      messages: [
        { role: "user", content: "which first?" },
        { role: "assistant", content: "The safety spec." },
        { role: "user", content: "why?" },
      ],
    };
    await run(deps(llm.client), history);
    const args = llm.stream.mock.calls[0]![0];
    expect(args.messages).toEqual(history.messages);
    expect(args.system).toContain("Spanish");
    expect(args.system).toContain("apr-003"); // queue context is grounded in the fixture
  });
});

describe("runChat: help mode is grounded in the policy note", () => {
  it("sends only the retrieved policy sections to the model and cites them", async () => {
    const llm = fakeLlm({ stream: () => streamOf(["Every 90 days [P5]."]) });
    const events = await run(deps(llm.client), req("help", "how often are gas sensors recalibrated?"));

    const meta = events[0] as Extract<StreamEvent, { type: "meta" }>;
    expect(meta.citations[0]).toEqual({ id: "P5", title: "Sensor specifications and maintenance" });
    const system = llm.stream.mock.calls[0]![0].system;
    expect(system).toContain("Gas sensors are recalibrated every 90 days");
    expect(done(events).outcome).toBe("ai");
  });

  it("does not call the model at all when nothing in the policy matches", async () => {
    const llm = fakeLlm();
    const events = await run(deps(llm.client), req("help", "what's the weather in Paris?"));
    expect(llm.stream).not.toHaveBeenCalled();
    expect(done(events)).toMatchObject({ outcome: "rule", reason: "no_policy_match" });
    expect(text(events)).toMatch(/policy/i);
  });

  it("falls back to quoting the retrieved policy text if the model is down", async () => {
    const llm = fakeLlm({ stream: stalledStream });
    const events = await run(deps(llm.client, 40), req("help", "how often are gas sensors recalibrated?"));
    expect(done(events)).toMatchObject({ outcome: "fallback", reason: "timeout" });
    expect(text(events)).toContain("Gas sensors are recalibrated every 90 days");
  });
});

describe("runChat: failure handling", () => {
  it("streams a deterministic fallback when the model stalls before the first token", async () => {
    const llm = fakeLlm({ stream: stalledStream });
    const events = await run(deps(llm.client, 40), req("talk", "what first?"));
    expect(done(events)).toMatchObject({ outcome: "fallback", reason: "timeout" });
    expect(text(events)).toContain("Safety Equipment & Sensor Specs");
  });

  it("streams a fallback when the API key is rejected", async () => {
    const llm = fakeLlm({
      stream: () => streamThenFail([], Object.assign(new Error("invalid x-api-key"), { status: 401 })),
    });
    const events = await run(deps(llm.client), req("teach", "how do I review an item?"));
    expect(done(events)).toMatchObject({ outcome: "fallback", reason: "llm_error" });
    expect(text(events)).toMatch(/Step 1/);
  });

  it("keeps the partial answer and reports outcome=partial if the stream dies mid-answer", async () => {
    const llm = fakeLlm({ stream: () => streamThenFail(["Step 1: open the item. "]) });
    const events = await run(deps(llm.client), req("teach", "how do I review?"));
    expect(text(events)).toBe("Step 1: open the item. ");
    expect(done(events)).toMatchObject({ outcome: "partial", reason: "llm_error" });
  });

  it("treats an empty model answer as a failure, not as a blank success", async () => {
    const llm = fakeLlm({ stream: () => streamOf(["", "   "]) });
    const events = await run(deps(llm.client), req("talk", "anything?"));
    expect(done(events).outcome).toBe("fallback");
    expect(text(events).trim().length).toBeGreaterThan(0);
  });

  it("always ends with exactly one done event", async () => {
    for (const stream of [() => streamOf(["x"]), stalledStream, () => streamThenFail(["x"])]) {
      const llm = fakeLlm({ stream });
      const events = await run(deps(llm.client, 40), req("talk", "hi"));
      expect(events.filter((e) => e.type === "done")).toHaveLength(1);
      expect(events.at(-1)?.type).toBe("done");
    }
  });
});
