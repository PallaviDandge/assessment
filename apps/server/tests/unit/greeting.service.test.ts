import { GreetingResponseSchema } from "@cb/shared";
import { getGreeting } from "../../src/services/greeting";
import { loadQueue } from "../../src/data/queue";
import { fakeLlm, hang } from "../helpers/fakeLlm";

const queue = loadQueue();
const deps = (llm: ReturnType<typeof fakeLlm>["client"], timeoutMs = 1000) => ({ llm, queue, timeoutMs });

describe("getGreeting", () => {
  it("returns the model's greeting when it states the real pending count", async () => {
    const llm = fakeLlm({
      structured: async () => ({ greeting: "Good afternoon, Riya. You have 4 items waiting; the safety spec is most urgent." }),
    });
    const res = await getGreeting(deps(llm.client), { locale: "en", operatorName: "Riya" });
    expect(GreetingResponseSchema.parse(res)).toEqual(res);
    expect(res).toMatchObject({ source: "ai", pendingCount: 4 });
    expect(JSON.stringify(llm.structured.mock.calls[0]![0].messages)).toContain("Riya");
  });

  it("rejects a greeting that states the wrong pending count (hallucinated number)", async () => {
    const llm = fakeLlm({ structured: async () => ({ greeting: "Hello! You have 7 approvals pending." }) });
    const res = await getGreeting(deps(llm.client), { locale: "en" });
    expect(res.source).toBe("fallback");
    expect(res.greeting).toContain("4");
  });

  it("falls back to a template greeting that still references the live count when the model stalls", async () => {
    const llm = fakeLlm({ structured: (a) => hang(a.signal) });
    const res = await getGreeting(deps(llm.client, 30), { locale: "en" });
    expect(res).toMatchObject({ source: "fallback", pendingCount: 4 });
    expect(res.greeting).toMatch(/4 (items|approvals)/);
  });
});
