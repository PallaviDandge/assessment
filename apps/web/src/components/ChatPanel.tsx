"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMode } from "@cb/shared";
import { useAssistantStore, type UiMessage } from "@/store/assistant";

const INTRO: Record<ChatMode, { text: string; suggestions: string[] }> = {
  talk: {
    text: "Ask me anything about the approvals waiting for you.",
    suggestions: ["Which of these needs my attention first and why?", "What is overdue right now?"],
  },
  help: {
    text: "Ask an operational question. Answers come only from the approval policy, with sources.",
    suggestions: ["How often are gas sensors recalibrated?", "Can I approve something I submitted myself?"],
  },
  teach: {
    text: "New to approvals? I'll walk you through reviewing an item step by step. Ask follow-ups any time.",
    suggestions: ["Teach me how to review and act on an approval."],
  },
};

const OUTCOME_LABEL: Partial<Record<NonNullable<UiMessage["outcome"]>, string>> = {
  fallback: "AI unavailable · standard guidance",
  partial: "Response interrupted, may be incomplete",
  rule: "Policy lookup · no AI used",
};

function AssistantBubble({ message }: { message: UiMessage }) {
  const label = message.outcome ? OUTCOME_LABEL[message.outcome] : undefined;
  return (
    <div className="msg msg-assistant" data-testid="assistant-message" aria-busy={message.streaming ? "true" : "false"}>
      <div className="msg-text">
        {message.content}
        {message.streaming && <span className="cursor" aria-hidden="true" />}
      </div>
      {message.citations && message.citations.length > 0 && !message.streaming && (
        <div className="citations">
          Sources:{" "}
          {message.citations.map((c) => (
            <span key={c.id} className="chip">
              [{c.id}] {c.title}
            </span>
          ))}
        </div>
      )}
      {label && <div className={`badge badge-${message.outcome}`}>{label}</div>}
    </div>
  );
}

export function ChatPanel({ mode }: { mode: ChatMode }) {
  const conversation = useAssistantStore((s) => s.conversations[mode]);
  const sendMessage = useAssistantStore((s) => s.sendMessage);
  const retry = useAssistantStore((s) => s.retry);
  const stop = useAssistantStore((s) => s.stop);
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const busy = conversation.status === "loading" || conversation.status === "streaming";
  const intro = INTRO[mode];

  useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight });
  }, [conversation.messages, conversation.status]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    const text = draft;
    setDraft("");
    void sendMessage(mode, text);
  };

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef} role="log" aria-live="polite">
        {conversation.messages.length === 0 && (
          <div className="chat-intro">
            <p>{intro.text}</p>
            <div className="suggestions">
              {intro.suggestions.map((s) => (
                <button key={s} type="button" className="suggestion" onClick={() => void sendMessage(mode, s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {conversation.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg msg-user">
              {m.content}
            </div>
          ) : (
            <AssistantBubble key={m.id} message={m} />
          ),
        )}

        {conversation.status === "loading" && (
          <div role="status" className="thinking">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Assistant is thinking…
          </div>
        )}

        {conversation.status === "error" && (
          <div role="alert" className="error-box">
            <span>{conversation.error}</span>
            <button type="button" className="link-btn" onClick={() => void retry(mode)}>
              Retry
            </button>
          </div>
        )}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <input
          type="text"
          aria-label="Message the assistant"
          placeholder={busy ? "Waiting for the answer…" : "Type your question…"}
          value={draft}
          maxLength={2000}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
        />
        {conversation.status === "streaming" ? (
          <button type="button" className="btn-secondary" onClick={() => stop(mode)}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={busy || !draft.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}
