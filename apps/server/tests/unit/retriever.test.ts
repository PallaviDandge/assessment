import { readFileSync } from "fs";
import { join } from "path";
import { createRetriever } from "../../src/rag/retriever";

const policy = readFileSync(join(__dirname, "../../src/data/policy.md"), "utf8");

describe("policy retriever", () => {
  const retriever = createRetriever(policy);

  it("splits the policy note into one chunk per ## section", () => {
    expect(retriever.chunks.map((c) => c.id)).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    expect(retriever.chunks[0]?.title).toBe("Review service levels");
  });

  it("ranks the section that actually answers the question first", () => {
    expect(retriever.retrieve("how often are gas sensors recalibrated?")[0]?.id).toBe("P5");
    expect(retriever.retrieve("can I approve something I submitted myself?")[0]?.id).toBe("P3");
    expect(retriever.retrieve("who must approve a camera map with blind spots")[0]?.id).toBe("P4");
    expect(retriever.retrieve("deadline to review safety critical PPE content")[0]?.id).toBe("P1");
  });

  it("returns at most k chunks, best first", () => {
    const hits = retriever.retrieve("review approve reject video", 2);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score);
  });

  it("returns nothing for questions the policy does not cover", () => {
    expect(retriever.retrieve("what is the weather in Paris tomorrow?")).toEqual([]);
    expect(retriever.retrieve("   ")).toEqual([]);
  });
});
