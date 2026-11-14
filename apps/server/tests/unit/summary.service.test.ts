import { SummaryResponseSchema } from "@cb/shared";
import { getSummary } from "../../src/services/summary";
import { formatWait, rankQueue } from "../../src/services/ranking";
import { loadQueue } from "../../src/data/queue";
import { SUMMARY_PROMPT } from "../../src/prompts/summary";
import { LlmTimeoutError, LlmInvalidOutputError } from "../../src/llm/errors";
import { fakeLlm, hang } from "../helpers/fakeLlm";

const queue = loadQueue();
const NOW = new Date("2026-09-18T16:00:00.000Z");

const validModelOutput = {
  headline: "4 items pending; start with the safety spec.",
  items: [
    { id: "apr-003", priority: "high", reason: "Safety-critical, 4h SLA.", suggestedAction: "Review now" },
    { id: "apr-001", priority: "medium", reason: "Onboarding, 1 day SLA.", suggestedAction: "Review today" },
    { id: "apr-004", priority: "medium", reason: "Camera map needs zone check.", suggestedAction: "Check zones" },
    { id: "apr-002", priority: "low", reason: "Training video.", suggestedAction: "Watch in full" },
  ],
};

function deps(llm: ReturnType<typeof fakeLlm>["client"], timeoutMs = 200) {
  return { llm, queue, timeoutMs, now: () => NOW };
}

describe("getSummary", () => {
  it("returns validated AI output with the prompt version when the model answers correctly", async () => {
    const llm = fakeLlm({ structured: async () => validModelOutput });
    const res = await getSummary(deps(llm.client), "en");

    expect(SummaryResponseSchema.parse(res)).toEqual(res);
    expect(res.source).toBe("ai");
    expect(res.promptVersion).toBe(SUMMARY_PROMPT.version);
    expect(res.summary.items.map((i) => i.id)).toEqual(["apr-003", "apr-001", "apr-004", "apr-002"]);
    expect(res.notice).toBeUndefined();
  });

  it("sends the queue and the operator's language to the model and asks for the summary schema", async () => {
    const llm = fakeLlm({ structured: async () => validModelOutput });
    await getSummary(deps(llm.client), "hi");

    const args = llm.structured.mock.calls[0]![0];
    const sent = JSON.stringify(args.messages);
    for (const item of queue) expect(sent).toContain(item.id);
    expect(args.system).toContain("Hindi");
    expect(args.schema).toBeDefined();
  });

  it("falls back to deterministic ranking when the model returns a broken shape", async () => {
    const llm = fakeLlm({ structured: async () => ({ headline: "hi", items: [{ id: "apr-001" }] }) });
    const res = await getSummary(deps(llm.client), "en");

    expect(res.source).toBe("fallback");
    expect(res.notice).toMatch(/unavailable|standard/i);
    expect(res.summary).toEqual(rankQueue(queue, NOW));
  });

  it("falls back when the model invents an approval that is not in the queue", async () => {
    const hallucinated = {
      ...validModelOutput,
      items: [...validModelOutput.items.slice(0, 3), { ...validModelOutput.items[3]!, id: "apr-999" }],
    };
    const llm = fakeLlm({ structured: async () => hallucinated });
    const res = await getSummary(deps(llm.client), "en");
    expect(res.source).toBe("fallback");
  });

  it("falls back when the model silently drops an item from the queue", async () => {
    const llm = fakeLlm({
      structured: async () => ({ ...validModelOutput, items: validModelOutput.items.slice(0, 3) }),
    });
    const res = await getSummary(deps(llm.client), "en");
    expect(res.source).toBe("fallback");
    expect(res.summary.items).toHaveLength(queue.length);
  });

  it("falls back when the model lists an item twice", async () => {
    const llm = fakeLlm({
      structured: async () => ({
        ...validModelOutput,
        items: [...validModelOutput.items.slice(0, 3), validModelOutput.items[0]],
      }),
    });
    expect((await getSummary(deps(llm.client), "en")).source).toBe("fallback");
  });

  it("falls back within the timeout when the model stalls", async () => {
    const llm = fakeLlm({ structured: (args) => hang(args.signal) });
    const started = Date.now();
    const res = await getSummary(deps(llm.client, 40), "en");
    expect(Date.now() - started).toBeLessThan(1000);
    expect(res.source).toBe("fallback");
  });

  it.each([
    ["timeout", new LlmTimeoutError(8000)],
    ["refusal / invalid output", new LlmInvalidOutputError("refusal")],
    ["revoked API key", Object.assign(new Error("401 invalid x-api-key"), { status: 401 })],
  ])("never throws on %s; always returns a schema-valid response", async (_label, err) => {
    const llm = fakeLlm({ structured: async () => Promise.reject(err) });
    const res = await getSummary(deps(llm.client), "en");
    expect(SummaryResponseSchema.safeParse(res).success).toBe(true);
    expect(res.source).toBe("fallback");
  });
});

describe("rankQueue (deterministic fallback)", () => {
  it("covers every queue item exactly once and puts safety-critical content first", () => {
    const ranked = rankQueue(queue, NOW);
    expect(new Set(ranked.items.map((i) => i.id))).toEqual(new Set(queue.map((q) => q.id)));
    expect(ranked.items).toHaveLength(queue.length);
    expect(ranked.items[0]).toMatchObject({ id: "apr-003", priority: "high" });
  });

  it("describes waiting time in hours for short waits and days for long ones", () => {
    expect(formatWait(5.4)).toBe("5h");
    expect(formatWait(30 * 24)).toBe("30 days");
  });

  it("orders items so priorities never go up as you read down the list", () => {
    const order = { high: 0, medium: 1, low: 2 } as const;
    const p = rankQueue(queue, NOW).items.map((i) => order[i.priority]);
    expect([...p].sort()).toEqual(p);
  });
});
