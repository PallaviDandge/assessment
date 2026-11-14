const KEY = "approvals-assistant-session";

/**
 * Per-tab session id, used by the server as the rate-limit key. Not an auth
 * token; it only groups this tab's requests.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") return "server-render";
  let id = window.sessionStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
    window.sessionStorage.setItem(KEY, id);
  }
  return id;
}
