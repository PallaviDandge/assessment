import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SummaryView } from "@/components/SummaryView";
import { resetAssistantStore, useAssistantStore } from "@/store/assistant";
import { jsonResponse } from "./helpers";

const queue = [
  { id: "apr-001", title: "Site Patrol Onboarding & Checklists", type: "Folder", submittedBy: "Sam HelpAdmin", status: "pending_review", submittedAt: "2026-09-18T08:05:00.000Z", location: "x", description: "d" },
  { id: "apr-003", title: "Safety Equipment & Sensor Specs", type: "PDF", submittedBy: "Sam HelpAdmin", status: "pending_review", submittedAt: "2026-09-18T11:15:00.000Z", location: "x", description: "d" },
];

const summary = (source: "ai" | "fallback") => ({
  source,
  promptVersion: "summary@1.0.0",
  generatedAt: "2026-09-18T16:00:00.000Z",
  locale: "en",
  ...(source === "fallback" ? { notice: "AI summary is unavailable right now." } : {}),
  summary: {
    headline: "2 pending; start with the safety spec.",
    items: [
      { id: "apr-003", priority: "high", reason: "Safety-critical, 4h SLA.", suggestedAction: "Review now" },
      { id: "apr-001", priority: "medium", reason: "Operational.", suggestedAction: "Review today" },
    ],
  },
});

beforeEach(() => {
  resetAssistantStore();
  useAssistantStore.setState({ queue: queue as never });
});

describe("SummaryView", () => {
  it("shows a loading state, then the validated summary in priority order with item titles", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    render(<SummaryView />);

    expect(screen.getByRole("status")).toHaveTextContent(/preparing your summary/i);
    resolve(jsonResponse(200, summary("ai")));

    expect(await screen.findByText("2 pending; start with the safety spec.")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Safety Equipment & Sensor Specs")).toBeInTheDocument();
    expect(within(items[0]!).getByText(/high/i)).toBeInTheDocument();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });

  it("shows the fallback notice when the server degraded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, summary("fallback"))));
    render(<SummaryView />);
    expect(await screen.findByText(/AI summary is unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("refuses to render a response that breaks the contract, and offers retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { source: "ai", summary: "free-form model text" })),
    );
    render(<SummaryView />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/unexpected response/i);
    expect(screen.queryByText(/free-form model text/)).not.toBeInTheDocument();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, summary("ai"))));
    await userEvent.setup().click(within(alert).getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("2 pending; start with the safety spec.")).toBeInTheDocument();
  });
});
