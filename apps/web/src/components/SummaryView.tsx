"use client";

import { useEffect, useMemo, useState } from "react";
import { useAssistantStore } from "@/store/assistant";
import { SpeakerIcon } from "./Icons";

const SPEECH_LANG = { en: "en-US", hi: "hi-IN", es: "es-ES", fr: "fr-FR", de: "de-DE" } as const;

export function SummaryView() {
  const summary = useAssistantStore((s) => s.summary);
  const queue = useAssistantStore((s) => s.queue);
  const loadSummary = useAssistantStore((s) => s.loadSummary);
  const [speaking, setSpeaking] = useState(false);
  const titles = useMemo(() => new Map(queue.map((q) => [q.id, q.title])), [queue]);

  useEffect(() => {
    if (summary.status === "idle") void loadSummary();
  }, [summary.status, loadSummary]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (summary.status === "loading" || summary.status === "idle") {
    return (
      <div className="summary">
        <div role="status" className="thinking">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Preparing your summary…
        </div>
        <div className="skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (summary.status === "error" || !summary.data) {
    return (
      <div className="summary">
        <div role="alert" className="error-box">
          <span>{summary.error}</span>
          <button type="button" className="link-btn" onClick={() => void loadSummary()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { data } = summary;
  const readAloud = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const text = [
      data.summary.headline,
      ...data.summary.items.map((i, n) => `${n + 1}. ${titles.get(i.id) ?? i.id}. ${i.reason}`),
    ].join(" ");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = data.source === "ai" ? SPEECH_LANG[data.locale] : "en-US";
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  };

  return (
    <div className="summary">
      <p className="summary-headline">{data.summary.headline}</p>
      {data.notice && <p className="notice">{data.notice}</p>}
      <ol className="summary-list">
        {data.summary.items.map((item) => (
          <li key={item.id} className="summary-item">
            <div className="summary-item-head">
              <span className="summary-title">{titles.get(item.id) ?? item.id}</span>
              <span className={`prio prio-${item.priority}`}>{item.priority}</span>
            </div>
            <p className="summary-reason">{item.reason}</p>
            <p className="summary-action">→ {item.suggestedAction}</p>
          </li>
        ))}
      </ol>
      <div className="summary-footer">
        <span className="muted">{data.source === "ai" ? `AI summary · ${data.promptVersion}` : "Standard policy ranking"}</span>
        <span className="summary-buttons">
          {typeof window !== "undefined" && "speechSynthesis" in window && (
            <button type="button" className="link-btn" onClick={readAloud}>
              <SpeakerIcon width={14} height={14} /> {speaking ? "Stop reading" : "Read aloud"}
            </button>
          )}
          <button type="button" className="link-btn" onClick={() => void loadSummary()}>
            Refresh
          </button>
        </span>
      </div>
    </div>
  );
}
