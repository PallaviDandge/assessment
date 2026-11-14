# Approvals Assistant: Crystal Ball Command Centre (Wave 2 take-home)

A working rebuild of the **Approvals** assistant panel: five entry points (Present me Summary, Talk to me, Help me, Teach me, Replay Greeting), each backed by a server-side Claude call that is validated before the UI shows it, has an 8s budget, and falls back to a deterministic answer.

```
apps/web        Next.js 16 + React 19 + Zustand          → panel UI, streaming chat, Vitest + Testing Library
apps/server     Express 5 + TypeScript strict + Anthropic SDK → API, prompts, retrieval, fallbacks, Jest + Supertest
packages/shared Zod schemas: the API contract used by both sides (mirrored in docs/openapi.yaml)
```

## Run it

Requires Node 20+ (developed on Node 24).

```bash
npm install
cp apps/server/.env.example apps/server/.env      # then set ANTHROPIC_API_KEY
cp apps/web/.env.example apps/web/.env.local       # optional; defaults to http://localhost:4000
npm run dev                                        # API on :4000, web on :3000
```

Open http://localhost:3000. **Without an API key the app still works**: every action shows its labelled fallback. This is the quickest way to see failure handling (see "Try the failure paths" below).

```bash
npm test          # server (Jest + Supertest) then web (Vitest)
npm run typecheck # shared, server and web
```

## What each action does

| Action | Endpoint | AI layer | Validation before the UI | Non-AI fallback |
|---|---|---|---|---|
| Present me Summary | `POST /api/assistant/summary` | Structured output (`betaZodOutputFormat`) ranks the queue by urgency in the operator's language | Zod schema **and** a cross-check: every queue id exactly once, none invented | Policy-based ranking (SLA category, then age) |
| Talk to me | `POST /api/assistant/chat` `mode=talk` | Multi-turn streaming, grounded in queue + policy | Each NDJSON event validated client-side | Ranked queue overview |
| Help me | `mode=help` | Retrieval over the policy note (BM25, 5 chunks), so only retrieved sections go to the model, with citations | Citations come from retrieval, not the model | Quotes the retrieved sections verbatim; **no match → no LLM call** |
| Teach me | `mode=teach` | Step-by-step walkthrough that adapts to follow-ups | Same as chat | Scripted 6-step walkthrough |
| Replay Greeting | `POST /api/assistant/greeting` | Short structured greeting using the live count | Zod + every number in the text must be the real count (or part of a title) | Template with the live count and most-urgent item |

Streaming is `fetch` + NDJSON (`meta` → `delta`… → `done{outcome}`); `outcome` is `ai | fallback | rule | partial`, and the UI labels anything that isn't `ai`. Summary and greeting are **not** streamed on purpose: partial JSON can't be validated, so these two show a skeleton and then the validated result.

## AI judgment, fallback design, and what I'd change

**AI-necessary:** *Talk to me* and *Teach me*. Free-form follow-ups ("why that one?", "I don't get step 3") can't be scripted. *Help me* needs the model only to phrase a grounded answer; retrieval decides what it may say, so a question the policy doesn't cover never reaches the model.

**AI-unnecessary (but AI-improved):** *Summary* ranking is deterministic from the policy SLAs. The model adds a localized narrative and judgment, but the fallback produces the same ordering. *Replay Greeting* is the weakest case: a template covers 90% of its value. I kept the LLM because the brief asks for it, but I validate the one fact that matters (the count) and would cut the call first under cost pressure.

**Fallback design:** every call goes through `withTimeout` / `withStreamTimeouts` (8s, which aborts the upstream request). SDK retries are off, so the 8s budget is real. Any failure (timeout, 401, refusal, truncated or schema-invalid output, hallucinated id or count) returns a 200 with a deterministic answer marked `fallback`. If a stream dies mid-answer, the text so far is kept and marked `partial`. Express never returns HTML errors.

**With more time:** an eval set of real operator questions to tune prompts and the retrieval threshold (`minScore` is hand-picked from 5 chunks), plus localized fallbacks; today they are English-only and the UI says so.

## Assumptions and challenged criteria

- **"8s timeout" on streaming.** A hard 8s *total* cap would cut off long but healthy answers. I applied 8s to *time-to-first-token* and to *idle time between tokens*; summary and greeting have an 8s total cap. Configurable with `LLM_TIMEOUT_MS`.
- **Urgency signal.** The four seed items share status and date, so "prioritised by urgency" needs a basis: I added `submittedAt` times and descriptions to the fixture and wrote SLA rules into the policy note (P1). The fixture dates are Sep 2026, so every item reads as overdue today; that is correct behaviour.
- **"Per-session" throttling.** Sessions are a client-generated `x-session-id` (sessionStorage), which a client can rotate, so there is also a looser per-IP limit (5×). Default is 20 AI requests/min/session, with a JSON 429 that the UI displays. In-memory store: right for one process; production needs Redis and limits keyed on the authenticated user and on tokens spent.
- **Model.** `claude-opus-5-5` at `effort: low` (these are short tasks, and low effort keeps latency inside the budget). Server-side refusal fallbacks are enabled (`fallbacks: "default"`), so a policy decline is retried on a fallback model within the same call. `ANTHROPIC_MODEL` / `LLM_EFFORT` override.
- **Language.** A language picker (EN/HI/ES/FR/DE) drives the `locale` sent to every prompt. "Out loud" uses the browser's speech synthesis on the summary (no extra service).
- **Substitutions:** Express instead of Next route handlers, to keep the API key, rate limiter and timeouts in one long-lived server process. No pgvector, as the brief allows: BM25 over 5 chunks.

## Try the failure paths

| Scenario | How | What you should see |
|---|---|---|
| Killed API key | `ANTHROPIC_API_KEY=sk-ant-invalid npm run dev` | Every action answers, labelled "AI unavailable · standard guidance"; server logs `reason=llm_error` |
| Forced timeout | `LLM_TIMEOUT_MS=1 npm run dev` | Same, with `reason=timeout` |
| Rate limit | `RATE_LIMIT_PER_MINUTE=2` then click Replay Greeting 3× | Readable "try again in Ns" message |
| Server down | stop the API | Panel shows "We couldn't reach the assistant", with Retry |

## Tests: what they would catch

Read the tests before the code; they were committed first (see the `test(...)… (red)` → `feat(...)… (green)` pairs in `git log`).

- `apps/server/tests/unit/summary.service.test.ts`: model returns a broken shape, an invented id, a dropped item or a duplicate → fallback. Stall, 401 or refusal → never throws, still schema-valid.
- `apps/server/tests/unit/chat.service.test.ts`: stream protocol; help mode sends only retrieved policy text and skips the LLM on no match; stall before first token → fallback; death mid-stream → `partial`; empty answer ≠ success.
- `apps/server/tests/unit/anthropic.client.test.ts`: the SDK adapter with a mocked SDK. `parsed_output` null, refusal, `max_tokens` and schema mismatch all throw; only text deltas are forwarded.
- `apps/server/tests/unit/timeout.test.ts`: timeouts abort the upstream request and also fire mid-stream.
- `apps/server/tests/integration/assistant.api.test.ts` (Supertest): summary and chat success and timeout paths over HTTP, request validation, per-session 429, JSON-only errors.
- `apps/web/tests/ChatPanel.test.tsx`: loading → token-by-token streaming → done; an event split across network chunks; fallback/partial labels; network error + retry; a malformed event is **not rendered**; a stream that ends without `done` is an error; 429.
- `apps/web/tests/SummaryView.test.tsx`, `AssistantWidget.test.tsx`: loading/validated/fallback/contract-violation states; Replay Greeting refetches; close and reopen.

## Where prompts live

`apps/server/src/prompts/*.ts`, one versioned export per action (`summary@1.0.0`, …). `prompts/index.ts` selects the active version. The version is returned to the client and logged with each call. Logs record metadata only (event, reason, version), never prompts or user text.

## AI tools used

Built with Claude Code (Claude Opus 5.5) as a pair programmer: scaffolding, first drafts of tests and components, and checking current Anthropic SDK usage (structured outputs, streaming, refusal fallbacks). I reviewed every change. Design decisions (contract-first schemas, the coverage and count checks, timeout semantics, what gets an LLM call) were made deliberately and are the parts to scrutinise. The UI was checked in a headless browser against the no-API-key path.
