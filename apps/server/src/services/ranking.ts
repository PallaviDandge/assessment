import type { ApprovalItem, Priority, SummaryContent } from "@cb/shared";

/**
 * Deterministic urgency ranking, derived from the policy's service levels (P1).
 * This is the non-AI fallback for the summary and is also used to build
 * fallback text for the other actions. Same input -> same output, always.
 */
interface Classified {
  item: ApprovalItem;
  priority: Priority;
  category: string;
  slaHours: number;
}

const ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function classify(item: ApprovalItem): Classified {
  if (/safety|sensor|ppe|emergency/i.test(item.title)) {
    return { item, priority: "high", category: "Safety-critical", slaHours: 4 };
  }
  if (item.type === "Folder" || /onboarding|checklist|procedure/i.test(item.title)) {
    return { item, priority: "medium", category: "Operational", slaHours: 24 };
  }
  return { item, priority: "low", category: "Training media", slaHours: 48 };
}

function waitingHours(item: ApprovalItem, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(item.submittedAt).getTime()) / 3_600_000);
}

export function rankItems(queue: ApprovalItem[], now: Date): Classified[] {
  return queue
    .map(classify)
    .sort(
      (a, b) =>
        ORDER[a.priority] - ORDER[b.priority] ||
        a.item.submittedAt.localeCompare(b.item.submittedAt) ||
        a.item.id.localeCompare(b.item.id),
    );
}

export function formatWait(hours: number): string {
  return hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)} days`;
}

const ACTIONS: Record<Priority, string> = {
  high: "Review now and check thresholds against the HMI Panel",
  medium: "Review today; confirm every checklist step is present",
  low: "Schedule a full review (watch / inspect in full)",
};

export function rankQueue(queue: ApprovalItem[], now: Date): SummaryContent {
  const ranked = rankItems(queue, now);
  const first = ranked[0];
  return {
    headline:
      ranked.length === 0
        ? "No approvals are pending."
        : `${ranked.length} approvals pending. Start with "${first!.item.title}".`,
    items: ranked.map(({ item, priority, category, slaHours }) => {
      const waited = waitingHours(item, now);
      const overdue = waited > slaHours;
      return {
        id: item.id,
        priority,
        reason: `${category} content (${slaHours}h review target); waiting ${formatWait(waited)}${overdue ? ", overdue, escalate to the Site Supervisor" : ""}.`,
        suggestedAction: ACTIONS[priority],
      };
    }),
  };
}
