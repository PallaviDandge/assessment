import type { RequestHandler } from "express";
import type { z } from "zod";
import type { ErrorResponse } from "@cb/shared";

/**
 * Validates req.body against a shared Zod schema before the handler runs.
 * The parsed (and defaulted) value is put on res.locals.body; handlers never
 * read the raw req.body.
 */
export function validateBody<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const body: ErrorResponse = {
        error: {
          code: "invalid_request",
          message: "Request body does not match the API contract.",
          details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      };
      res.status(400).json(body);
      return;
    }
    res.locals.body = parsed.data;
    next();
  };
}
