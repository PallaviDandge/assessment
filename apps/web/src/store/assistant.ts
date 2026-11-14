"use client";

import { create } from "zustand";
import type {
  ApprovalItem,
  ChatMode,
  Citation,
  GreetingResponse,
  Locale,
  StreamEvent,
  SummaryResponse,
} from "@cb/shared";
import { ApiError, fetchGreeting, fetchQueue, fetchSummary, streamChat } from "@/lib/api";

/**
 * All assistant state lives here (no prop drilling). Components select the
 * slice they need; async actions own loading / error transitions.
 */
export type View = "home" | "summary" | ChatMode;
type LoadStatus = "idle" | "loading" | "success" | "error";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Assistant only: who produced it and whether it completed. */
  outcome?: Extract<StreamEvent, { type: "done" }>["outcome"];
  citations?: Citation[];
  streaming?: boolean;
}

export interface Conversation {
  messages: UiMessage[];
  /** "loading" = waiting for the first token; "streaming" = tokens arriving. */
  status: "idle" | "loading" | "streaming" | "error";
  error?: string;
}

interface AssistantState {
  open: boolean;
  view: View;
  locale: Locale;
  operatorName: string;
  queue: ApprovalItem[];
  greeting: { status: LoadStatus; data?: GreetingResponse; error?: string };
  summary: { status: LoadStatus; data?: SummaryResponse; error?: string };
  conversations: Record<ChatMode, Conversation>;

  setOpen(open: boolean): void;
  setView(view: View): void;
  setLocale(locale: Locale): void;
  loadQueue(): Promise<void>;
  loadGreeting(): Promise<void>;
  loadSummary(): Promise<void>;
  sendMessage(mode: ChatMode, text: string): Promise<void>;
  retry(mode: ChatMode): Promise<void>;
  stop(mode: ChatMode): void;
  clearConversation(mode: ChatMode): void;
}

const emptyConversation = (): Conversation => ({ messages: [], status: "idle" });

const initialData = () => ({
  open: true,
  view: "home" as View,
  locale: "en" as Locale,
  operatorName: "Riya",
  queue: [] as ApprovalItem[],
  greeting: { status: "idle" as LoadStatus },
  summary: { status: "idle" as LoadStatus },
  conversations: { talk: emptyConversation(), help: emptyConversation(), teach: emptyConversation() },
});

const controllers: Partial<Record<ChatMode, AbortController>> = {};
let seq = 0;
const nextId = () => `m${++seq}`;

const messageOf = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";

export const useAssistantStore = create<AssistantState>()((set, get) => {
  const patchConversation = (mode: ChatMode, fn: (c: Conversation) => Conversation) =>
    set((s) => ({ conversations: { ...s.conversations, [mode]: fn(s.conversations[mode]) } }));

  /** Streams an assistant reply for the conversation's current history. */
  const runTurn = async (mode: ChatMode) => {
    controllers[mode]?.abort();
    const controller = new AbortController();
    controllers[mode] = controller;

    const history = get()
      .conversations[mode].messages.filter((m) => m.content.trim() !== "")
      .map(({ role, content }) => ({ role, content }));
    const assistantId = nextId();
    patchConversation(mode, (c) => ({ ...c, status: "loading", error: undefined }));

    const updateAssistant = (fn: (m: UiMessage) => UiMessage) =>
      patchConversation(mode, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === assistantId ? fn(m) : m)),
      }));

    try {
      await streamChat(
        { mode, locale: get().locale, messages: history },
        (event) => {
          if (event.type === "meta") {
            patchConversation(mode, (c) => ({
              ...c,
              messages: [
                ...c.messages,
                { id: assistantId, role: "assistant", content: "", citations: event.citations, streaming: true },
              ],
            }));
          } else if (event.type === "delta") {
            patchConversation(mode, (c) => ({ ...c, status: "streaming" }));
            updateAssistant((m) => ({ ...m, content: m.content + event.text }));
          } else {
            updateAssistant((m) => ({ ...m, outcome: event.outcome, streaming: false }));
          }
        },
        controller.signal,
      );
      patchConversation(mode, (c) => ({ ...c, status: "idle" }));
    } catch (err) {
      if (err instanceof ApiError && err.kind === "aborted") {
        updateAssistant((m) => ({ ...m, streaming: false, outcome: m.outcome ?? "partial" }));
        patchConversation(mode, (c) => ({ ...c, status: "idle" }));
        return;
      }
      // Drop the unfinished assistant bubble; the user's question stays so Retry can resend it.
      patchConversation(mode, (c) => ({
        ...c,
        status: "error",
        error: messageOf(err),
        messages: c.messages.filter((m) => m.id !== assistantId),
      }));
    } finally {
      if (controllers[mode] === controller) delete controllers[mode];
    }
  };

  return {
    ...initialData(),

    setOpen: (open) => set({ open }),
    setView: (view) => set({ view }),
    setLocale: (locale) => {
      // Cached AI text is in the old language; drop it so it is regenerated.
      set({ locale, summary: { status: "idle" } });
      void get().loadGreeting();
    },

    loadQueue: async () => {
      try {
        set({ queue: await fetchQueue() });
      } catch {
        /* the panel works without the table; nothing to show the operator */
      }
    },

    loadGreeting: async () => {
      set((s) => ({ greeting: { ...s.greeting, status: "loading", error: undefined } }));
      try {
        const data = await fetchGreeting({ locale: get().locale, operatorName: get().operatorName });
        set({ greeting: { status: "success", data } });
      } catch (err) {
        set({ greeting: { status: "error", error: messageOf(err) } });
      }
    },

    loadSummary: async () => {
      set((s) => ({ summary: { ...s.summary, status: "loading", error: undefined } }));
      try {
        set({ summary: { status: "success", data: await fetchSummary(get().locale) } });
      } catch (err) {
        set({ summary: { status: "error", error: messageOf(err) } });
      }
    },

    sendMessage: async (mode, text) => {
      const content = text.trim();
      const { status } = get().conversations[mode];
      if (!content || status === "loading" || status === "streaming") return;
      patchConversation(mode, (c) => ({
        ...c,
        messages: [...c.messages, { id: nextId(), role: "user", content }],
      }));
      await runTurn(mode);
    },

    retry: async (mode) => {
      const last = get().conversations[mode].messages.at(-1);
      if (last?.role === "user") await runTurn(mode);
    },

    stop: (mode) => controllers[mode]?.abort(),

    clearConversation: (mode) => {
      controllers[mode]?.abort();
      patchConversation(mode, () => emptyConversation());
    },
  };
});

/** Test helper: restore initial state between tests. */
export function resetAssistantStore() {
  for (const c of Object.values(controllers)) c?.abort();
  useAssistantStore.setState(initialData());
}
