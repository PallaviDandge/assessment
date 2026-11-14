"use client";

import { useEffect } from "react";
import { LOCALES, LocaleSchema, type ChatMode } from "@cb/shared";
import { useAssistantStore, type View } from "@/store/assistant";
import { ChatPanel } from "./ChatPanel";
import { SummaryView } from "./SummaryView";
import { AvatarMark, BackIcon, CardArt, ChatIcon, CloseIcon, ExpandIcon, ExternalIcon, HomeIcon, InfoIcon } from "./Icons";

const CARDS: { view: Exclude<View, "home">; label: string; art: "summary" | ChatMode }[] = [
  { view: "summary", label: "Present me Summary", art: "summary" },
  { view: "talk", label: "Talk to me", art: "talk" },
  { view: "help", label: "Help me", art: "help" },
  { view: "teach", label: "Teach me", art: "teach" },
];

const TITLES: Record<Exclude<View, "home">, string> = {
  summary: "Summary",
  talk: "Talk to me",
  help: "Help me",
  teach: "Teach me",
};

function Greeting() {
  const greeting = useAssistantStore((s) => s.greeting);
  if (greeting.status === "loading" && !greeting.data) {
    return <p className="greeting greeting-loading">Getting your queue ready…</p>;
  }
  if (greeting.status === "error") return <p className="greeting greeting-error">{greeting.error}</p>;
  if (!greeting.data) return null;
  return (
    <p className={`greeting${greeting.status === "loading" ? " greeting-refreshing" : ""}`}>{greeting.data.greeting}</p>
  );
}

function Home() {
  const setView = useAssistantStore((s) => s.setView);
  return (
    <>
      <Greeting />
      <div className="cards">
        {CARDS.map((c) => (
          <button key={c.view} type="button" className="card" onClick={() => setView(c.view)}>
            <CardArt variant={c.art} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function AssistantWidget() {
  const open = useAssistantStore((s) => s.open);
  const view = useAssistantStore((s) => s.view);
  const locale = useAssistantStore((s) => s.locale);
  const queueSize = useAssistantStore((s) => s.queue.length);
  const greetingStatus = useAssistantStore((s) => s.greeting.status);
  const { setOpen, setView, setLocale, loadGreeting, loadQueue } = useAssistantStore.getState();

  useEffect(() => {
    if (greetingStatus === "idle") void loadGreeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  if (!open) {
    return (
      <button type="button" className="launcher" aria-label="Open assistant" onClick={() => setOpen(true)}>
        <ChatIcon width={20} height={20} />
      </button>
    );
  }

  return (
    <>
      <section className="widget" role="dialog" aria-label="Approvals assistant">
        <header className="widget-header">
          <AvatarMark />
          <h2>Approvals</h2>
          <span className="header-actions">
            <button type="button" className="icon-btn" aria-label="About this assistant" title="AI answers are checked before they are shown; if AI is unavailable you get standard guidance.">
              <InfoIcon />
            </button>
            <button type="button" className="icon-btn" aria-label="Expand" title="Expand (not implemented in this demo)" disabled>
              <ExpandIcon />
            </button>
            <button type="button" className="icon-btn" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <CloseIcon />
            </button>
          </span>
        </header>

        <div className="subbar">
          {view === "home" ? (
            <span className="crumb">
              <HomeIcon width={14} height={14} /> Approvals
            </span>
          ) : (
            <button type="button" className="crumb crumb-btn" aria-label="Back" onClick={() => setView("home")}>
              <BackIcon width={14} height={14} /> {TITLES[view]}
            </button>
          )}
          <span className="subbar-right">
            <select
              aria-label="Language"
              value={locale}
              onChange={(e) => setLocale(LocaleSchema.parse(e.target.value))}
            >
              {Object.entries(LOCALES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="replay"
              onClick={() => {
                setView("home");
                void loadGreeting();
              }}
            >
              Replay Greeting
            </button>
          </span>
        </div>

        <div className="widget-body">
          {view === "home" && <Home />}
          {view === "summary" && <SummaryView />}
          {(view === "talk" || view === "help" || view === "teach") && <ChatPanel key={view} mode={view} />}
        </div>

        <footer className="widget-footer">
          <span>{queueSize} folders / items</span>
          <span className="hmi">
            HMI Panel <ExternalIcon />
          </span>
        </footer>
      </section>
      <button type="button" className="launcher" aria-label="Minimize assistant" onClick={() => setOpen(false)}>
        <CloseIcon width={18} height={18} />
      </button>
    </>
  );
}
