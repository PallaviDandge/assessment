import { loadConfig, llmConnection } from "../../src/config";

describe("LLM provider config", () => {
  it("defaults to the Anthropic API with Opus 5.5 and server-side fallbacks", () => {
    const c = loadConfig({ ANTHROPIC_API_KEY: "sk-ant-x" });
    expect(llmConnection(c, { ANTHROPIC_API_KEY: "sk-ant-x" })).toEqual({
      baseURL: undefined,
      authToken: undefined,
      model: "claude-opus-5-5",
      serverFallbacks: true,
    });
  });

  it("routes through OpenRouter's Anthropic-compatible endpoint with a bearer token and OpenRouter model id", () => {
    const env = { LLM_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-or-v1-x" };
    expect(llmConnection(loadConfig(env), env)).toEqual({
      baseURL: "https://openrouter.ai/api",
      authToken: "sk-or-v1-x",
      model: "anthropic/claude-opus-5.5",
      serverFallbacks: false,
    });
  });

  it("lets ANTHROPIC_MODEL override the per-provider default", () => {
    const env = { LLM_PROVIDER: "openrouter", OPENROUTER_API_KEY: "k", ANTHROPIC_MODEL: "anthropic/claude-haiku-5.5" };
    expect(llmConnection(loadConfig(env), env).model).toBe("anthropic/claude-haiku-5.5");
  });

  it("rejects an unknown provider at startup", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "gemini" })).toThrow();
  });
});
