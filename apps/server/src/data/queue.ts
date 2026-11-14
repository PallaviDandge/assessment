import { readFileSync } from "fs";
import { join } from "path";
import { QueueSchema, type ApprovalItem } from "@cb/shared";
import raw from "./approvals.json";

/** Fixture is validated at load: a malformed seed fails fast at startup, not mid-request. */
export function loadQueue(): ApprovalItem[] {
  return QueueSchema.parse(raw);
}

export function loadPolicy(): string {
  return readFileSync(join(__dirname, "policy.md"), "utf8");
}
