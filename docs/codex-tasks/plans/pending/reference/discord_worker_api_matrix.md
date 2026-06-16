# Discord worker API matrix for `Codex_Discord_BOT`

## Purpose

This note captures the worker HTTP contract that the current Discord bridge already expects or is clearly preparing for.

It is meant to answer four practical questions:

1. Which worker endpoints are already needed by the current Discord repository?
2. Which endpoints are only partially integrated today?
3. Which endpoints are optional for the first usable bridge but important for a more `chadingTV/codex-discord`-like control center?
4. What is the best implementation order on the worker side?

This document is intentionally based on the current repository code, not only on older plans.

## Working assumption

The strategic goal does **not** change:

- the target remains a richer, more operational Discord control-center model inspired by `chadingTV/codex-discord`
- the bridge stays Discord-first
- the worker PC stays the real execution side
- the Discord bridge does not become a local-Codex-first runtime

Because of that, the worker API becomes the contract that lets the richer Discord UX exist safely on top of the worker/NAS split.

## Current command to worker mapping

The following Discord behaviors already rely on worker endpoints directly:

| Discord behavior | Current code path | Worker capability needed |
|---|---|---|
| `/doctor` | `renderDoctor()` | health check |
| `/session-new` | `renderNewSession()` | create session + create thread |
| `/session-resume` | `renderAttach()` | create session when needed + resume thread |
| `/session-stop` | `renderAbort()` | abort current run |
| `/session` | `refreshSessionInfo()` | session info refresh |
| `/last` | `renderLastResponse()` | last response lookup |
| `/git-status` | `renderGitStatus()` | repo status lookup |
| `/run-tests` | `renderRunTests()` | named check execution |
| normal message prompt flow | `sendPromptToContext()` / `executePrompt()` | prompt streaming |
| approval buttons | `handleApprovalDecision()` | submit approval decision |

The following worker client methods are now integrated into Discord session visibility:

| Worker client method | Current usage state |
|---|---|
| `listSessions()` | used by `/sessions` to show worker-reported sessions for the active workspace |
| `getSessionStatus()` | used by `/session` to enrich the stored view with live worker status |

## Endpoint matrix

### Tier 1: required for the current Discord bridge to feel real

These endpoints are either already required or already exposed to end users through existing commands.

| Endpoint | Current status in Discord repo | Why it matters | Minimum response shape |
|---|---|---|---|
| `GET /health` | already used | `/doctor` depends on it | envelope with `data.mode` or any healthy response object |
| `POST /sessions/create` | already used | required for new prompt contexts and `/session-new` | `{ sessionId, info }` |
| `GET /sessions/:id/info` | already used | `/session` refreshes stored session metadata from it | `{ threadId, workspace, ... }` |
| `POST /sessions/:id/new-thread` | already used | required for `/session-new` and auto-created prompt sessions | `{ threadId, workspace, ... }` |
| `POST /sessions/:id/resume` | already used | required for `/session-resume` | `{ threadId, workspace, ... }` |
| `POST /sessions/:id/abort` | already used | required for `/session-stop` | success envelope |
| `POST /sessions/:id/prompt` | already used | central prompt execution path for slash and normal message mode | newline-delimited stream events |

### Tier 2: already user-visible in Discord, but currently optional on some workers

These endpoints are already expected by the bridge, but the bridge still has fallback text such as “not available from this worker yet”.

| Endpoint | Current status in Discord repo | Current fallback behavior if missing | Minimum response shape |
|---|---|---|---|
| `GET /sessions/:id/last-response` | already used by `/last` when no local preview exists | “Last response is not available” | `{ text?: string, ... }` |
| `GET /sessions/:id/repo-status` | already used by `/git-status` | “Git status is not available from this worker yet” | `{ workspace?, branch?, ahead?, behind?, clean?, summary? }` |
| `POST /sessions/:id/checks/tests` | already used by `/run-tests` | “Named test checks are not available from this worker yet” | `{ name, ok, summary, details? }` |
| `POST /sessions/:id/approval` | already used by approval button handling | “Approval decision could not be forwarded to the worker” | success envelope |

### Tier 3: important for the richer final control-center model

These are not yet fully integrated into the Discord side, but they align strongly with the broader end goal.

| Endpoint | Current status in Discord repo | Why it matters for the long-term target | Minimum response shape |
|---|---|---|---|
| `GET /sessions` | now used by `/sessions` in a workspace-scoped way | richer worker-backed `/sessions` view, recovery, and multi-session visibility | array of `{ sessionId, info? }` |
| `GET /sessions/:id/status` | now used by `/session` | live busy/idle/error/waiting view from the worker instead of mostly local state | worker-defined status object |

## Prompt stream contract

The prompt stream is the most important worker capability because the richer Discord UX depends on it.

The current worker client already understands these event types:

| Event type | Used for |
|---|---|
| `text_delta` | build final assistant text |
| `tool_start` | count and later summarize tool activity |
| `tool_update` | client can parse it, but Discord UX does not yet surface it deeply |
| `tool_end` | count tool failures |
| `approval_request` | create approval records and show approval buttons |
| `turn_complete` | collect token usage |
| `agent_end` | final stream completion marker |
| `error` | fail the turn cleanly |

Practical consequence:

- a basic worker can get by with text-only deltas and completion
- a worker that supports approval-driven tool use should also emit `approval_request`
- a worker that aims for the fuller control-center model should emit consistent tool lifecycle events too

## What is already “good enough” vs. what is still shallow

### Already good enough for current pilot progress

- health probing
- create session
- create thread
- resume thread
- abort
- prompt streaming
- local SQLite state persistence on the Discord side

### Still shallow compared with the intended richer end state

- `/sessions` now includes worker-reported data, but it is still a compact text view rather than a richer operator panel
- `/session` now exposes worker status, but the worker status contract is still intentionally loose and not yet normalized
- approval forwarding exists, but the full worker-side approval lifecycle still needs confidence
- `/git-status`, `/run-tests`, and `/last` are not yet guaranteed worker capabilities
- tool stream events are parsed, but not yet turned into a richer real-time Discord operator view

## Recommended worker-side implementation order

This is the best order if the goal is to keep moving toward the richer final Discord control-center model without losing stability.

### Step 1: close the already exposed optional gaps

These should be treated as the first worker-side completion batch because Discord commands already expose them:

1. `GET /sessions/:id/repo-status`
2. `POST /sessions/:id/checks/tests`
3. `GET /sessions/:id/last-response`
4. `POST /sessions/:id/approval`

Reason:

- the user can already trigger these flows
- missing support makes the bridge feel partially implemented
- finishing them gives immediate operator value

### Step 2: strengthen and normalize worker-truth session visibility

Next batch:

1. `GET /sessions`
2. `GET /sessions/:id/status`

Reason:

- this path has now started on the Discord side
- the remaining work is to normalize and trust these worker responses more deeply
- it supports future `/sessions`, `/doctor`, and `/session` improvements

### Step 3: enrich the prompt stream contract

Next batch:

1. keep stable `approval_request`
2. keep stable `tool_start` / `tool_update` / `tool_end`
3. make token usage and completion reliable

Reason:

- this unlocks a better operator UX on the Discord side
- it aligns more strongly with the `codex-discord`-style control-center feel

## Suggested Discord-side follow-up after worker completion

Once the worker-side gaps above are closed, the next Discord-side improvements should be:

1. make `/sessions` optionally show worker-backed live sessions, not only local stored ones
2. make `/session` show richer live worker status
3. improve approval feedback after approve/deny/auto decisions
4. improve real-time run visibility from streamed tool events

## Code references

- Worker client contract:
  - [src/worker/worker-client.ts](d:/codex_works/Codex_Discord_BOT/src/worker/worker-client.ts)
- Main command/orchestration usage:
  - [src/core/orchestrator.ts](d:/codex_works/Codex_Discord_BOT/src/core/orchestrator.ts)
- Slash command surface:
  - [src/bot/command-definitions.ts](d:/codex_works/Codex_Discord_BOT/src/bot/command-definitions.ts)
- Discord adapter:
  - [src/bot/discord-bot.ts](d:/codex_works/Codex_Discord_BOT/src/bot/discord-bot.ts)
- Current mocked expectations in tests:
  - [test/command-handlers.test.ts](d:/codex_works/Codex_Discord_BOT/test/command-handlers.test.ts)
