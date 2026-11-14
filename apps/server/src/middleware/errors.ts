import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ErrorResponse } from "@cb/shared";
import { errorMessage, log } from "../lib/logger";

export const notFound: RequestHandler = (_req, res) => {
  const body: ErrorResponse = { error: { code: "not_found", message: "No such endpoint." } };
  res.status(404).json(body);
};

/** Last line of defence: every error leaves as JSON in the shared shape, never an HTML stack trace. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (res.headersSent) {
    res.end();
    return;
  }
  if (status === 500) log.warn("http.unhandled", { error: errorMessage(err) });
  const body: ErrorResponse =
    status === 500
      ? { error: { code: "internal", message: "Something went wrong. Please try again." } }
      : { error: { code: "invalid_request", message: "The request could not be read (malformed JSON?)." } };
  res.status(status).json(body);
};
