import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantWidget } from "@/components/AssistantWidget";
import { resetAssistantStore } from "@/store/assistant";
import { jsonResponse } from "./helpers";

const greeting = (text: string, source = "ai") =>
  jsonResponse(200, { source, promptVersion: "greeting@1.0.0", greeting: text, pendingCount: 4 });

function routeFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  const fn = vi.fn(async (url: string) => {
    const key = Object.keys(handlers).find((k) => url.endsWith(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    return handlers[key]!();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => resetAssistantStore());

describe("AssistantWidget", () => {
  it("renders the panel structure: header, greeting, four action cards and footer", async () => {
    routeFetch({ "/api/queue": () => jsonResponse(200, []), "/api/assistant/greeting": () => greeting("Hello, 4 items pending.") });
    render(<AssistantWidget />);

    expect(screen.getByRole("dialog", { name: /approvals/i })).toBeInTheDocument();
    for (const label of [/present me summary/i, /talk to me/i, /help me/i, /teach me/i]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(await screen.findByText("Hello, 4 items pending.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replay greeting/i })).toBeInTheDocument();
  });

  it("Replay Greeting asks the server for a fresh greeting instead of replaying a fixed string", async () => {
    let n = 0;
    const fetchMock = routeFetch({
      "/api/queue": () => jsonResponse(200, []),
      "/api/assistant/greeting": () => greeting(n++ === 0 ? "First greeting, 4 pending." : "Second greeting, 4 pending."),
    });
    render(<AssistantWidget />);
    await screen.findByText("First greeting, 4 pending.");

    await userEvent.setup().click(screen.getByRole("button", { name: /replay greeting/i }));
    expect(await screen.findByText("Second greeting, 4 pending.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/greeting"))).toHaveLength(2);
  });

  it("close affordance hides the panel and the launcher brings it back", async () => {
    routeFetch({ "/api/queue": () => jsonResponse(200, []), "/api/assistant/greeting": () => greeting("Hi, 4 pending.") });
    const user = userEvent.setup();
    render(<AssistantWidget />);

    await user.click(screen.getByRole("button", { name: /close assistant/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open assistant/i }));
    expect(screen.getByRole("dialog", { name: /approvals/i })).toBeInTheDocument();
  });

  it("navigates from a card into its view and back home", async () => {
    routeFetch({ "/api/queue": () => jsonResponse(200, []), "/api/assistant/greeting": () => greeting("Hi, 4 pending.") });
    const user = userEvent.setup();
    render(<AssistantWidget />);

    await user.click(screen.getByRole("button", { name: /help me/i }));
    expect(screen.getByRole("textbox", { name: /message the assistant/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("button", { name: /teach me/i })).toBeInTheDocument();
  });

  it("a failed greeting shows a readable error, not a broken panel", async () => {
    routeFetch({
      "/api/queue": () => jsonResponse(200, []),
      "/api/assistant/greeting": () => Promise.reject(new TypeError("Failed to fetch")),
    });
    render(<AssistantWidget />);
    expect(await screen.findByText(/couldn't reach the assistant/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /talk to me/i })).toBeEnabled();
  });
});
