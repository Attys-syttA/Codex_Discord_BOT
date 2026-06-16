# Plan: Refined evolution of `Codex_Discord_BOT` into a full Discord control center based on the real reference implementation

Allapot: pending / reszben megvalosult aktiv foirany

Kapcsolodo jelenlegi helyzet:
- This document describes the current main development direction.
- The repository already implements several base parts from this plan, but the full worker-side and operator-facing finish is not complete yet.

Elkeszult reszek:
- The main shape of the new module structure is in place (`bot`, `core`, `db`, `security`, `worker`).
- SQLite-backed state and the session/binding/queue/approval foundations are in place.
- The mixed Discord prompt model with slash commands and normal messages has started.
- NAS packaging and inventory discipline are stronger now.
- `/session` can now enrich stored session data with live worker session status when available.
- `/sessions` can now show worker-reported sessions alongside stored local session records.
- The approval flow now has TTL-based lazy expiry, audit logging, stored Discord message IDs, and deterministic session reset from expired approvals.
- Queue plus approval interaction is now deterministic enough for the local bridge side:
  - approval waiting no longer allows a competing new turn
  - queued prompts can resume automatically after approval or expiry
- Operator-facing status views are now much stronger than the original pilot:
  - `/doctor`, `/last`, `/session`, and `/sessions` now distinguish local stored state from worker-live state more clearly
  - thread drift between local stored thread identity and worker-reported thread identity is now visible
- The Discord-side worker contract expectations are now explicit and better tested for:
  - `repo-status`
  - `last-response`
  - `approval`
  - named `tests` checks

Nyitott reszek:
- Full alignment of the real worker-side helper endpoints, not just the Discord-side contract and tests.
- Private guild plus NAS/worker smoke testing for the whole mixed flow.
- Final UX decisions in edge cases such as what queued prompts should do after a denied approval.
- Later documentation consolidation once the first real smoke-tested milestone is complete.

## Summary

This refined plan is no longer based only on descriptions. It is based on comparing the actual reviewed `chadingTV/codex-discord` design direction with the current `Codex_Discord_BOT` repository state.

Starting facts:

- the local `Codex_Discord_BOT` repository is already a working pilot:
  - slash commands exist
  - worker HTTP connectivity exists
  - persistent state already moved beyond the earliest file-only approach
  - a NAS Docker bridge already exists
- the `chadingTV/codex-discord` direction shows a much more mature pattern:
  - SQLite project/session mapping
  - separate `bot`, `codex`, `db`, `security`, `utils` layers
  - normal message prompt flow
  - queue handling
  - approval buttons
  - operator-focused commands such as `/last`, `/usage`, `/register`, `/unregister`, `/sessions`, `/queue`, `/auto-approve`
- your fixed decisions stay unchanged:
  - the goal is a full control center
  - the worker/NAS trust boundary stays
  - the prompt surface stays mixed: slash commands plus normal messages
  - the Discord bridge should not become a direct local Codex CLI runner in normal operation

Because of that, the end goal is not to copy `chadingTV/codex-discord`, but to adapt its Discord-centered UX and state-management patterns into your NAS bridge plus separate worker PC model.

## Refined target architecture

### 1. Move to a modular structure

The current repository should keep moving toward this structure:

- `src/bot/`
  - Discord client
  - slash command definitions
  - interaction handler
  - message handler
  - Discord reply/update/render logic

- `src/core/`
  - context resolution
  - orchestration
  - queue
  - approval state machine
  - session lifecycle

- `src/db/`
  - SQLite connection
  - repository functions
  - types and migrations

- `src/worker/`
  - successor to the current `worker-client`
  - worker API adapter
  - stream event normalization
  - helper endpoints for repo/git/test actions

- `src/security/`
  - allowlist
  - rate limit
  - channel/workspace/worker access rules
  - message-content guard logic

- `src/config/`
  - `.env`
  - NAS env
  - worker binding
  - channel mapping
  - deploy modes

This is an important difference compared with the first plan: here the module boundaries are not only conceptual layers, but concrete boundaries supported by the reference design direction too.

### 2. SQLite as the primary state store

Following the reference direction, `.discord-bot-state/sessions.json` should not remain the primary source of truth.

The minimum stable schema should cover:

- `channel_bindings`
  - `guild_id`
  - `channel_id`
  - `workspace`
  - `worker_id`
  - `auto_prompt_enabled`
  - `auto_approve_mode`
  - `created_at`
  - `updated_at`

- `thread_bindings`
  - `guild_id`
  - `parent_channel_id`
  - `thread_id`
  - `session_mode`
  - `display_name`
  - `created_at`
  - `updated_at`

- `sessions`
  - `context_key`
  - `guild_id`
  - `channel_id`
  - `thread_id`
  - `workspace`
  - `worker_id`
  - `worker_session_id`
  - `codex_thread_id`
  - `status`
  - `last_activity_at`
  - `last_prompt_preview`
  - `last_response_preview`
  - `updated_at`

- `queue_items`
  - `id`
  - `context_key`
  - `discord_user_id`
  - `source_message_id`
  - `prompt_text`
  - `status`
  - `created_at`
  - `started_at`
  - `finished_at`

- `approval_requests`
  - `id`
  - `context_key`
  - `worker_id`
  - `worker_session_id`
  - `approval_kind`
  - `payload_json`
  - `discord_message_id`
  - `status`
  - `created_at`
  - `resolved_at`
  - `resolved_by_discord_user_id`

- `audit_log`
  - `id`
  - `context_key`
  - `actor_discord_user_id`
  - `action`
  - `result`
  - `detail_json`
  - `created_at`

There is no need to overdesign this in the first rounds. The key point is stable project/session mapping.

### 3. Worker-first, not local-Codex-first

The reference repository is built around local login, local app-server behavior, and direct local session discovery. In your case this can only be adapted partially.

Fixed rule:

- the Discord bot must not treat local NAS-side `~/.codex/state_*.sqlite` files as the primary session source
- session listing, resume, and status should come through the worker API
- if the worker can inspect local Codex session state, that logic belongs on the worker side, not inside the Discord bridge

This is the most important architectural difference from the public reference direction.

## Main functional goals

### 1. Channel = project, thread = session lane

In line with your project rules:

- a Discord channel can be registered to one workspace and one worker
- threads under that channel act as separate Codex session lanes
- a normal message can become a prompt only inside a registered project channel or its thread
- the workspace always comes from the parent project channel
- one thread must not be moved across workspaces

### 2. Mixed command plus normal message model

The repository already moved beyond the earliest slash-only pilot. The target is:

- slash commands stay for admin, status, binding, queue, and approval operations
- normal Discord messages become the primary prompt input in an already registered project context
- Message Content Intent therefore becomes part of the serious mixed-flow version
- the normal message handler should activate only when:
  - the channel is registered
  - the user is allowlisted
  - the context is not blocked
  - the worker binding is valid

### 3. Queue and single-active-turn rule

This should be taken seriously from the reference direction:

- only one active turn per context at a time
- a new prompt arriving during an active run goes into a queue
- the queue is FIFO
- the queue should have a maximum size
- the queue must be visible and manageable from Discord

Commands:

- `/queue list`
- `/queue clear`

Behavior:

- for normal messages, if the context is busy:
  - queue automatically
  - send a short Discord confirmation
- if the queue is full:
  - reject the new item
  - return a clear error message

### 4. Approval UI

The reference makes it clear that this should be treated as a first-class part of the product.

Needed:

- `Approve`
- `Deny`
- `Auto-approve for this channel`

Minimum approval types:

- command execution
- file modification
- push/publish
- worker-sensitive action
- other dangerous tool actions

Rules:

- approval state goes into the database
- expiry handling is required
- only allowlisted users may decide
- every decision must be audited

### 5. Session toolset

The pilot command set should evolve toward this functional coverage:

- `/register-workspace`
- `/unregister-workspace`
- `/status`
- `/session`
- `/session-new`
- `/session-resume`
- `/session-stop`
- `/sessions`
- `/last`
- `/workers`
- `/worker-bind`
- `/queue list`
- `/queue clear`
- `/auto-approve`
- `/git-status`
- `/run-tests`
- `/handoff`
- `/doctor`

The earlier `/new`, `/attach`, `/abort`, and `/ask` commands should be aligned around this fuller model. The final names do not have to match one-by-one, but the functional coverage should.

## Concrete migration order

### Phase 0: repository structure and deploy base
- prepare the modular `src/` structure
- keep the NAS bundle generator and inventory rules, but align them to this repository's runtime
- formalize generation of `discord_nas_bridge/app/`
- document the transitional role of `.discord-bot-state/`

### Phase 1: database introduction
- keep `better-sqlite3`
- expand the `src/db/` layer
- fully replace the old JSON session registry as the primary source
- move channel binding and session mapping into the database
- keep bootstrap migration on first startup

### Phase 2: split the Discord adapter
- separate the current `command-handlers.ts`, `discord-bot.ts`, and `worker-client.ts` responsibilities more clearly
- keep interaction and message handlers distinct
- extend the normal message prompt flow
- move from a slash-first pilot toward a true mixed-flow runtime

### Phase 3: worker-aware orchestration
- keep the orchestration service around the worker API
- cover session create, resume, stop, status, and last response
- turn worker-level errors into human-readable Discord messages
- keep a per-context busy/idle/waiting_approval/error state model

### Phase 4: queue
- complete the queue database and memory model
- set queue limits
- improve queue UX
- define the exact rule for automatically starting the next queued item
- handle the interaction between stop and queue carefully

### Phase 5: approval system
- approval event model
- Discord buttons
- worker approval decision endpoint
- auto-approve per-channel policy
- approval expiry
- audit log

### Phase 6: operator commands and status
- `/sessions`
- `/last`
- `/git-status`
- `/run-tests`
- `/workers`
- `/worker-bind`
- a stronger `/doctor`
- compact but real status output

### Phase 7: public and NAS hardening
- keep inventory discipline mandatory in the Discord repository too
- keep the NAS bundle resilient when new files arrive
- define the SQLite file location under the NAS volume
- keep secret hygiene, changelog/state discipline, and deploy documentation aligned

## Important API and type changes

- the old `SessionRegistry` should give way to a DB-backed repository layer
- `WorkerClient` should support:
  - `listSessions`
  - `getSessionStatus`
  - `getRepoStatus`
  - `runNamedCheck`
  - `submitApprovalDecision`
  - optionally `getLastResponse`
- new domain types:
  - `ChannelBinding`
  - `ThreadBinding`
  - `SessionRecord`
  - `QueueItem`
  - `ApprovalRequest`
  - `AuditLogEntry`
- the Discord adapter should not talk directly to raw session storage or raw worker stream data
- bridge-internal stream events should have a normalized event union

## Test plan

### Unit tests
- config parsing
- SQLite repository operations
- context key generation
- channel/thread binding rules
- queue FIFO and limit behavior
- approval state transitions
- worker event normalization
- Discord output chunking and edit debounce

### Integration tests
- slash command -> orchestration -> mocked worker
- normal message -> prompt -> streamed reply
- busy session -> queue
- approval request -> Discord button -> worker decision
- `/sessions` list and resume
- `/worker-bind`
- restart -> restore from database

### Validation
- `npm test`
- `npm run typecheck`
- `npm run build`
- `ggshield` scan
- NAS bundle prepare/check
- private Discord guild smoke:
  - `/register-workspace`
  - normal message prompt
  - queue
  - approval
  - `/session`
  - `/sessions`
  - `/doctor`
  - `/git-status`

## Fixed assumptions

- The goal is a full Discord-centered control center, not only a stronger bridge.
- The worker/NAS trust boundary does not loosen.
- Bringing over tray/menubar apps from the reference direction is not a current goal.
- Direct/local-Codex-first mode is not a current goal.
- The following ideas are adopted from the reference direction with confidence:
  - SQLite project/session mapping
  - normal message prompt flow
  - queue
  - approval buttons
  - operator-style `/last`, `/sessions`, and `/usage` thinking
- Usage reporting can remain a second-round optional feature, because it may not be available from your worker-based model in the same way as the direct local reference setup.

## Sources

- Local reference note:
  - [codex_discord_comparison.md](d:/codex_works/Codex_Discord_BOT/docs/codex-tasks/plans/pending/reference/codex_discord_comparison.md)
- Public reference direction:
  - <https://github.com/chadingTV/codex-discord>
  - <https://github.com/chadingTV/codex-discord/blob/main/README.md>
  - <https://github.com/chadingTV/codex-discord/blob/main/SETUP.md>
  - <https://github.com/chadingTV/claudecode-discord/blob/main/README.md>
