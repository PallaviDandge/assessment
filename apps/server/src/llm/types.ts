import type { z } from "zod";
import type { ChatMessage } from "@cb/shared";

/**
 * The only seam between business logic and the model provider.
 * Services depend on this interface, never on the SDK, so tests can swap in a
 * fake and the provider could change without touching the services.
 */
export interface StructuredArgs<T> {
  system: string;
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  signal: AbortSignal;
}

export interface StreamArgs {
  system: string;
  messages: ChatMessage[];
  signal: AbortSignal;
}

export interface LlmClient {
  /** Resolves with schema-valid output or rejects. Never resolves with unvalidated data. */
  generateStructured<T>(args: StructuredArgs<T>): Promise<T>;
  /** Yields text chunks as the model produces them. Throws on failure / refusal. */
  streamText(args: StreamArgs): AsyncIterable<string>;
}
