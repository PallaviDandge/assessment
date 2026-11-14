/**
 * Active prompt versions. Route handlers and services import prompts from
 * here only; there are no inline prompt strings anywhere else. To roll out a
 * new version, add e.g. TALK_PROMPT_V2 next to V1 and point this map at it.
 */
import { TALK_PROMPT_V1 } from "./talk";
import { HELP_PROMPT_V1 } from "./help";
import { TEACH_PROMPT_V1 } from "./teach";

export { SUMMARY_PROMPT } from "./summary";
export { GREETING_PROMPT } from "./greeting";

export const PROMPTS = {
  talk: TALK_PROMPT_V1,
  help: HELP_PROMPT_V1,
  teach: TEACH_PROMPT_V1,
} as const;
