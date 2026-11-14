import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/ChatPanel";
import { resetAssistantStore } from "@/store/assistant";
import { controllableStream, delta, done, jsonResponse, meta } from "./helpers";

async function ask(text = "Which of these needs my attention first?") {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: /message the assistant/i }), text);
  await user.click(screen.getByRole("button", { name: /send/i }));
  return user;
}

const lastAssistantBubble = () => screen.getAllByTestId("assistant-message").at(-1)!;

beforeEach(() => resetAssistantStore());

describe("ChatPanel: loading state", () => {
  it("shows the user's message and a thinking indicator before the first token, and locks input", async () => {
    controllableStream();
    render(<ChatPanel mode="talk" />);
    await ask("Which first?");

    expect(screen.getByText("Which first?")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(/thinking/i);
    expect(screen.getByRole("textbox", { name: /message the assistant/i })).toBeDisabled();
    expect(screen.queryByTestId("assistant-message")).not.toBeInTheDocument();
  });

  it("sends the session id header and the full contract-shaped body", async () => {
    const s = controllableStream();
    render(<ChatPanel mode="help" />);
    await ask("How often are gas sensors recalibrated?");

    const [url, init] = s.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/assistant\/chat$/);
    expect(new Headers(init.headers).get("x-session-id")).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(JSON.parse(init.body as string)).toEqual({
      mode: "help",
      locale: "en",
      messages: [{ role: "user", content: "How often are gas sensors recalibrated?" }],
    });
  });
});

describe("ChatPanel: streaming state", () => {
  it("renders tokens as they arrive, not all at once at the end", async () => {
    const s = controllableStream();
    render(<ChatPanel mode="talk" />);
    await ask();

    await s.push(meta());
    await s.push(delta("Start with "));
    expect(lastAssistantBubble()).toHaveTextContent("Start with");
    expect(lastAssistantBubble()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await s.push(delta("the safety spec."));
    expect(lastAssistantBubble()).toHaveTextContent("Start with the safety spec.");

    await s.push(done("ai"));
    await s.close();
    expect(lastAssistantBubble()).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("textbox", { name: /message the assistant/i })).toBeEnabled();
  });

  it("reassembles an event split across two network chunks", async () => {
    const s = controllableStream();
    render(<ChatPanel mode="talk" />);
    await ask();

    await s.push(meta());
    const line = JSON.stringify(delta("split token")) + "\n";
    await s.pushRaw(line.slice(0, 10));
    await s.pushRaw(line.slice(10));
    await s.push(done("ai"));
    await s.close();
    expect(lastAssistantBubble()).toHaveTextContent("split token");
  });

  it("shows policy citations in help mode", async () => {
    const s = controllableStream();
    render(<ChatPanel mode="help" />);
    await ask("gas sensors?");
    await s.push(meta([{ id: "P5", title: "Sensor specifications and maintenance" }]));
    await s.push(delta("Every 90 days [P5]."));
    await s.push(done("ai"));
    await s.close();
    expect(screen.getByText(/Sensor specifications and maintenance/)).toBeInTheDocument();
  });

  it("supports a multi-turn conversation by sending prior turns back", async () => {
    let s = controllableStream();
    render(<ChatPanel mode="talk" />);
    const user = await ask("Which first?");
    await s.push(meta());
    await s.push(delta("The safety spec."));
    await s.push(done("ai"));
    await s.close();

    s = controllableStream();
    await user.type(screen.getByRole("textbox", { name: /message the assistant/i }), "Why?");
    await user.click(screen.getByRole("button", { name: /send/i }));
    const body = JSON.parse((s.fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages).toEqual([
      { role: "user", content: "Which first?" },
      { role: "assistant", content: "The safety spec." },
      { role: "user", content: "Why?" },
    ]);
  });
});

describe("ChatPanel: degraded and error states", () => {
  it("labels a deterministic fallback answer so the operator knows it is not AI", async () => {
    const s = controllableStream();
    render(<ChatPanel mode="talk" />);
    await ask();
    await s.push(meta());
    await s.push(delta("The AI assistant is unavailable right now..."));
    await s.push(done("fallback", "timeout"));
    await s.close();
    expect(within(lastAssistantBubble()).getByText(/standard guidance/i)).toBeInTheDocument();
  });

  it("keeps the partial answer and flags it as interrupted when the stream is cut", async () => {
    const s = controllableStream();
    render(<ChatPanel mode="teach" />);
    await ask("teach me");
    await s.push(meta());
    await s.push(delta("Step 1: open the item."));
    await s.push(done("partial", "llm_error"));
    await s.close();
    expect(lastAssistantBubble()).toHaveTextContent("Step 1: open the item.");
    expect(within(lastAssistantBubble()).getByText(/interrupted/i)).toBeInTheDocument();
  });

  it("shows an error with a working retry when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<ChatPanel mode="talk" />);
    const user = await ask("Which first?");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't reach the assistant/i);
    expect(screen.getByRole("textbox", { name: /message the assistant/i })).toBeEnabled();

    const s = controllableStream();
    await user.click(within(alert).getByRole("button", { name: /retry/i }));
    await s.push(meta());
    await s.push(delta("Recovered."));
    await s.push(done("ai"));
    await s.close();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(lastAssistantBubble()).toHaveTextContent("Recovered.");
    expect(screen.getAllByText("Which first?")).toHaveLength(1); // retry does not duplicate the question
  });

  it("treats a malformed stream event as an error instead of rendering it", async () => {
    const s = controllableStream();
    render(<ChatPanel mode="talk" />);
    await ask();
    await s.push(meta());
    await s.push({ type: "delta", content: "<script>wrong field</script>" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/unexpected response/i);
    expect(screen.queryByText(/wrong field/)).not.toBeInTheDocument();
  });

  it("treats a stream that ends without a done event as an error (silent failure)", async () => {
    const s = controllableStream();
    render(<ChatPanel mode="talk" />);
    await ask();
    await s.push(meta());
    await s.push(delta("Half an ans"));
    await s.close();
    expect(await screen.findByRole("alert")).toHaveTextContent(/ended unexpectedly/i);
  });

  it("shows the server's rate-limit message on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(429, {
          error: { code: "rate_limited", message: "Too many requests. Try again in 42s.", retryAfterSeconds: 42 },
        }),
      ),
    );
    render(<ChatPanel mode="talk" />);
    await ask();
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again in 42s/i);
  });
});
