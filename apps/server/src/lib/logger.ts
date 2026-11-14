/** Tiny structured logger. Never logs prompts, user text or secrets, only metadata. */
type Fields = Record<string, string | number | boolean | undefined>;

const quiet = process.env.NODE_ENV === "test";

export const log = {
  info: (event: string, fields: Fields = {}) => {
    if (!quiet) console.log(JSON.stringify({ level: "info", event, ...fields }));
  },
  warn: (event: string, fields: Fields = {}) => {
    if (!quiet) console.warn(JSON.stringify({ level: "warn", event, ...fields }));
  },
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : "unknown error";
}
