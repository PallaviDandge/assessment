import { rateLimit, ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request, RequestHandler } from "express";
import type { ErrorResponse } from "@cb/shared";

/**
 * Two layers, both in-memory (fine for one process, not for a fleet):
 *
 * 1. Per session: keyed by the client's x-session-id, so one operator tab
 *    can't drain the shared LLM budget. Falls back to IP if the header is
 *    missing or malformed.
 * 2. Per IP, looser: the session id is client-supplied and trivially rotated,
 *    so this caps what one machine can do by minting new ids.
 *
 * Production version: Redis store, key on the authenticated user, and limits
 * on tokens spent rather than request counts.
 */
const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function sessionKey(req: Request): string {
  const sid = req.header("x-session-id");
  return sid && SESSION_ID.test(sid) ? `sid:${sid}` : `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

const handler: Options["handler"] = (req, res, _next, options) => {
  const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(options.windowMs / 1000);
  const body: ErrorResponse = {
    error: {
      code: "rate_limited",
      message: `You're sending requests faster than the assistant allows. Try again in ${retryAfterSeconds}s.`,
      retryAfterSeconds,
    },
  };
  res.status(options.statusCode).json(body);
};

export function aiRateLimiters(perMinute: number): RequestHandler[] {
  const common = { windowMs: 60_000, standardHeaders: "draft-8" as const, legacyHeaders: false, handler };
  return [
    rateLimit({ ...common, limit: perMinute * 5, keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown") }),
    rateLimit({ ...common, limit: perMinute, keyGenerator: sessionKey }),
  ];
}
