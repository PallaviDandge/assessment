"use client";

import { useAssistantStore } from "@/store/assistant";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function ApprovalsTable() {
  const queue = useAssistantStore((s) => s.queue);
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">Pending approval requests</span>
        <span className="count-pill">{queue.length} items</span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Folder / content name</th>
            <th>Type</th>
            <th>Submitted by</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {queue.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Loading queue… (is the API server running on :4000?)
              </td>
            </tr>
          )}
          {queue.map((q) => (
            <tr key={q.id}>
              <td>
                <div className="cell-title">{q.title}</div>
                <div className="cell-sub">{q.location}</div>
              </td>
              <td>{q.type}</td>
              <td>{q.submittedBy}</td>
              <td>{fmt(q.submittedAt)}</td>
              <td>
                <span className="status-pill">Pending Review</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
