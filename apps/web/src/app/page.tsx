import { AssistantWidget } from "@/components/AssistantWidget";
import { ApprovalsTable } from "@/components/ApprovalsTable";

/** Backdrop: a lightweight approvals page so the widget is seen in context. */
export default function Page() {
  return (
    <div className="shell">
      <aside className="rail" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className={i === 1 ? "rail-dot active" : "rail-dot"} />
        ))}
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="brand">
            <strong>Crystal Ball</strong>
            <small>Command Centre</small>
          </div>
          <span className="avatar-sm">R</span>
        </header>
        <main className="content">
          <div className="page-head">
            <span className="back-pill">← Back to Dashboard</span>
            <h1>Approvals &amp; Review</h1>
          </div>
          <ApprovalsTable />
        </main>
        <footer className="page-foot">© 2026 Crystal Ball Command Centre · demo</footer>
      </div>
      <AssistantWidget />
    </div>
  );
}
