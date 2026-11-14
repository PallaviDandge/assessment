/**
 * API contract shared by server and web.
 *
 * These Zod schemas are the single source of truth for every request and
 * response that crosses the network. They were written before the routes
 * (see docs/openapi.yaml for the same contract in OpenAPI form). The server
 * validates incoming bodies against them; the web client validates every
 * response and every stream event against them before rendering, so the UI
 * never trusts raw server or model output.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Domain                                                              */
/* ------------------------------------------------------------------ */

export const LOCALES = {
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  de: "German",
} as const;

export const LocaleSchema = z.enum(["en", "hi", "es", "fr", "de"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const ApprovalItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["Folder", "Video", "PDF", "Image"]),
  submittedBy: z.string().min(1),
  status: z.literal("pending_review"),
  submittedAt: z.iso.datetime(),
  location: z.string(),
  description: z.string(),
});
export type ApprovalItem = z.infer<typeof ApprovalItemSchema>;

export const QueueSchema = z.array(ApprovalItemSchema);

export const PrioritySchema = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;

/** Who actually produced a piece of content shown to the operator. */
export const SourceSchema = z.enum([
  "ai", // LLM output that passed validation
  "fallback", // deterministic output because the LLM failed / timed out / was invalid
  "rule", // deterministic by design, the LLM was deliberately not called
]);
export type Source = z.infer<typeof SourceSchema>;

/* ------------------------------------------------------------------ */
/* Summary ("Present me Summary")                                      */
/* ------------------------------------------------------------------ */

export const SummaryItemSchema = z.object({
  id: z.string().min(1),
  priority: PrioritySchema,
  reason: z.string().min(1).max(400),
  suggestedAction: z.string().min(1).max(200),
});

/** Shape the model must return (also used for the deterministic fallback). */
export const SummaryContentSchema = z.object({
  headline: z.string().min(1).max(300),
  items: z.array(SummaryItemSchema).min(1),
});
export type SummaryContent = z.infer<typeof SummaryContentSchema>;

export const SummaryRequestSchema = z.object({ locale: LocaleSchema.default("en") });
export type SummaryRequest = z.infer<typeof SummaryRequestSchema>;

export const SummaryResponseSchema = z.object({
  source: SourceSchema,
  promptVersion: z.string(),
  generatedAt: z.iso.datetime(),
  locale: LocaleSchema,
  summary: SummaryContentSchema,
  /** Present when source === "fallback": a short operator-facing explanation. */
  notice: z.string().optional(),
});
export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

/* ------------------------------------------------------------------ */
/* Greeting ("Replay Greeting")                                        */
/* ------------------------------------------------------------------ */

export const GreetingContentSchema = z.object({
  greeting: z.string().min(1).max(280),
});

export const GreetingRequestSchema = z.object({
  locale: LocaleSchema.default("en"),
  operatorName: z.string().trim().min(1).max(60).optional(),
});
export type GreetingRequest = z.infer<typeof GreetingRequestSchema>;

export const GreetingResponseSchema = z.object({
  source: SourceSchema,
  promptVersion: z.string(),
  greeting: z.string().min(1),
  pendingCount: z.number().int().nonnegative(),
});
export type GreetingResponse = z.infer<typeof GreetingResponseSchema>;

/* ------------------------------------------------------------------ */
/* Conversations ("Talk to me", "Help me", "Teach me")                 */
/* ------------------------------------------------------------------ */

export const ChatModeSchema = z.enum(["talk", "help", "teach"]);
export type ChatMode = z.infer<typeof ChatModeSchema>;

/** Operators type at most 2,000 chars; assistant turns echoed back as history may be longer. */
export const ChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(8000),
  })
  .refine((m) => m.role !== "user" || m.content.length <= 2000, {
    message: "user messages are limited to 2000 characters",
    path: ["content"],
  });
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  mode: ChatModeSchema,
  locale: LocaleSchema.default("en"),
  messages: z
    .array(ChatMessageSchema)
    .min(1)
    .max(20)
    .refine((m) => m[0]?.role === "user", "conversation must start with a user message")
    .refine((m) => m[m.length - 1]?.role === "user", "last message must be from the user"),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const CitationSchema = z.object({ id: z.string(), title: z.string() });
export type Citation = z.infer<typeof CitationSchema>;

/**
 * Chat responses are streamed as NDJSON: one StreamEvent per line.
 *   meta  -> exactly once, first
 *   delta -> zero or more text chunks, rendered as they arrive
 *   done  -> exactly once, last; says who produced the text and why
 */
export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("meta"),
    promptVersion: z.string(),
    citations: z.array(CitationSchema),
  }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({
    type: z.literal("done"),
    /** "partial" = the AI stream started but was cut off mid-answer. */
    outcome: z.enum(["ai", "fallback", "rule", "partial"]),
    reason: z.string().optional(),
  }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum(["invalid_request", "rate_limited", "not_found", "internal"]),
    message: z.string(),
    retryAfterSeconds: z.number().optional(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
