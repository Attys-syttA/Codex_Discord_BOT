# Project State

## Current status

- Date: 2026-06-16
- Repository: `Codex_Discord_BOT`
- Phase: Discord control-center expansion on top of the pilot
- Runtime code: slash + normal message prompt flow, worker-backed session handling, SQLite state store, queue basics, hardened approval workflow, NAS Docker bridge
- Primary direction: separate Discord pilot with richer control-center UX, not a Telegram rewrite

## Current goal

Evolve the pilot into a fuller Discord control center without moving trusted execution off the worker PC.

## Completed

- Git history cleanup was completed locally:
  - `git-filter-repo` was installed on this machine
  - repository history was rewritten to replace the earlier private Discord IDs, operator name, bot name, private LAN IP examples, and machine-specific path examples
  - a pre-rewrite safety bundle and working-tree patch were saved under a local backup folder outside the repository
  - the `origin` remote was restored after the rewrite
- Worker-specific workspace root support was added:
  - each worker can declare its own optional `workspaceRoot`
  - manual channel mappings can stay repo-relative, for example `Codex_Discord_BOT`
  - auto forum mapping now builds the final workspace path from the selected worker's `workspaceRoot`
- Env loading was improved:
  - the bot can load the env file named in `CODEX_DISCORD_ENV_FILE`
  - if that is not set, it tries `.env` first and `.env.nas` second
  - worker shared secrets can come from env variables through `sharedSecretEnv`
- Public-repo hygiene was improved:
  - `.env.example` and `.env.nas.example` now use synthetic Discord IDs and placeholder worker values
  - test fixtures now use synthetic Discord IDs instead of real ones
  - docs and examples are being rewritten to remove real-looking private identifiers and machine-specific examples
  - `AGENTS.md` now also carries explicit public-repo hygiene rules so cleaned tracked files do not drift back toward real operational data later
- Plan and task discipline was strengthened:
  - `docs/codex-tasks/` now has an explicit lifecycle rule for active, not-started, reference, and done plans
  - active plan files are expected to carry `Elkeszult reszek` and `Nyitott reszek` status blocks
  - active plan files can now be checked automatically with `npm run plans:check`
- Local MCP housekeeping was improved:
  - a dedicated PowerShell helper can now list and clean duplicate Serena and filesystem MCP process trees
  - `npm run mcp:duplicates:list` shows what would be stopped
  - `npm run mcp:duplicates:clean` keeps one working root process tree per identical MCP command line and stops the extra copies
- Active plan readability was improved:
  - the wider active Discord control-center plan was rewritten into clean English text
  - the earlier broken character encoding no longer blocks practical use of the plan file
  - the original project-starting Discord plan was also rewritten into the same clean style
  - the two active plans now have a consistent structure and are easier to compare
- Worker-contract planning was clarified:
  - a dedicated reference note now maps current Discord commands and flows to the worker HTTP endpoints they already expect
  - the worker contract is now split into current core requirements, currently optional-but-user-visible endpoints, and longer-term control-center endpoints
  - the repository now has a concrete suggested worker-side implementation order for the next development phase
- Session visibility was improved:
  - `/session` now tries to show live worker session status, not only the stored local session record
  - `/sessions` now also shows worker-reported sessions for the active workspace when the worker supports it
- Approval workflow hardening is now in place:
  - `DISCORD_APPROVAL_TTL_MS` config is available with a 30 minute default
  - pending approvals now expire lazily during normal reads and button actions, without a background scheduler
  - approval message IDs are now written back to SQLite so the DB record can point to the Discord UI message
  - approval decisions and expiry now write audit-log entries, including worker-forward success or failure
  - `/doctor` and `/status` now show pending approval and auto-approve state more consistently
  - expired approval requests now move waiting sessions back to `idle` instead of leaving them stuck in `waiting_approval`
- Worker Tier-2 preparation moved forward:
  - the worker client now uses the dedicated `/sessions/:id/checks/tests` route for the built-in test check
  - generic named checks still stay on the general `/checks/:name` route for future reuse
  - worker session status summaries now prefer `status`, `state`, `mode`, and `phase` in a stable order
  - `/sessions` now shows a clearer live-status summary when the worker reports status-like fields alongside session info
- Operator status views were strengthened further:
  - `/doctor` now separates worker health from worker session visibility and also shows local session count
  - `/last` now clearly reports whether the shown text came from local preview, worker last-response, or neither
  - the fallback wording is now more explicit when there is no worker session or the worker last-response lookup fails
- Queue and approval interaction is now more deterministic:
  - if a session is waiting for approval, new prompts are queued instead of starting a competing turn
  - queued prompts can now resume automatically once approval is resolved or lazily expired
  - the prompt command path now returns a clearer queued message for the waiting-approval case
- `/sessions` moved closer to an operator panel:
  - the view now shows separate stored-session and worker-visible session counts
  - the current context's stored session is marked explicitly
  - stored local session data and worker-reported live session data now appear as cleaner separate sections
- Worker Tier-2 contract coverage on the Discord side is stronger:
  - the worker client now has explicit route tests for `repo-status`, `last-response`, and `approval`
  - `/git-status` now uses the same clearer source/fallback wording style as `/last`
- `/session` is now more compact as an operator panel:
  - it surfaces stored status, pending approvals, and queue depth near the top
  - worker session identity and live worker status remain visible, but in a more task-oriented order
- Local-versus-worker thread drift is now visible:
  - `/session` now shows stored thread ID and worker thread ID separately
  - `/session` marks whether the two thread views are aligned or different
  - `/sessions` now annotates stored session rows with worker thread ID and a `thread drift` note when the two sides differ
- Core runtime capabilities are in place:
  - `/doctor`, `/status`, `/session`, `/sessions`, `/last`, `/workers`, `/worker-bind`
  - `/session-new`, `/session-resume`, `/session-stop`, plus legacy aliases `/new`, `/attach`, `/abort`
  - `/register-workspace`, `/unregister-workspace`, `/queue list`, `/queue clear`, `/auto-approve`, `/git-status`, `/run-tests`, `/handoff`, `/ask`
  - `/ask` and normal Discord message prompts now share the same worker-aware orchestration layer
  - long answers are chunked into multiple Discord messages
  - only one active turn runs per context; extra prompts are queued
  - session, binding, queue, and approval state now live in SQLite
  - the first SQLite startup can import prior `.discord-bot-state/sessions.json` session data
- NAS runtime support is in place:
  - Docker-based NAS bridge under `discord_nas_bridge/`
  - generated deploy bundle under `discord_nas_bridge/app/`
  - manifest-based bundle inventory under `discord_nas_bridge/bundle-manifest.json`
- root-level packaging guardrail files: `nas-bundle.manifest.json` and `nas-runtime-inventory.json`
  - runtime state under `/data`

## Validation

- Passed in this working tree after the cleanup:
  - `npm test`
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `ggshield secret scan repo .`
- History spot-check passed after the rewrite:
  - current tracked files no longer contain the earlier real Discord IDs, operator name, bot name, or private LAN IP examples
  - `git log -G` no longer finds those exact earlier private identifiers in reachable history
- Earlier worker-path and env-loading updates also passed:
  - `npm run nas:bundle:prepare`
- New control-center foundation also passed:
  - `npm run typecheck`
  - `npm test`
  - `npm run plans:check`
  - `npm run nas:inventory:write`
  - `npm run nas:inventory:check`
  - `npm run nas:bundle:check`
- MCP duplicate cleanup helper passed:
  - `npm run mcp:duplicates:list`
  - `npm run mcp:duplicates:clean`
- Active plan cleanup passed:
  - `npm run plans:check`
  - `git diff --check`
- Worker API matrix close-out passed:
  - `npm run nas:inventory:write`
  - `npm run nas:inventory:check`
  - `git diff --check`
- Live worker session visibility work passed:
  - `npm test`
  - `npm run build`
  - `npm run plans:check`
  - `git diff --check`
- Approval workflow hardening work passed:
  - `npm test -- test/config.test.ts test/session-registry.test.ts test/command-handlers.test.ts`
  - `npm test`
  - `npm run build`
  - `npm run plans:check`
  - `git diff --check`
- Worker contract alignment and status normalization work passed:
  - `npm test -- test/worker-client.test.ts`
  - `npm test -- test/command-handlers.test.ts test/worker-client.test.ts`
  - `npm run build`
- Operator status-view strengthening work passed:
  - `npm test -- test/command-handlers.test.ts`
  - `npm run build`
- Queue plus approval interaction hardening work passed:
  - `npm test -- test/command-handlers.test.ts`
  - `npm run build`
- `/sessions` operator-panel pass work passed:
  - `npm test -- test/command-handlers.test.ts`
  - `npm run build`
- Worker Tier-2 contract coverage plus `/session` panel pass work passed:
  - `npm test -- test/worker-client.test.ts test/command-handlers.test.ts`
  - `npm run build`
- Thread-drift visibility pass work passed:
  - `npm test -- test/worker-client.test.ts test/command-handlers.test.ts`
  - `npm run build`

## Fresh policy note

- The repo-local `AGENTS.md` now explicitly says two things:
  - file add/rename/move/reclassification work is not done until the NAS inventory is green again
  - because the GitHub repo is public-facing, tracked docs/tests/examples must not drift back toward real IDs, names, paths, tokens, or private-looking operational values
- The repo-local `AGENTS.md` now also says that active planning documents under `docs/codex-tasks/` must show what is already done and what is still open.

## Next steps

1. Close the remaining worker-side Tier-2 implementation gaps on the real worker side, especially repo status, last response, and approval forwarding parity.
2. Decide whether queued prompts after denied approval should continue immediately or wait for explicit user retry in the later UX-polish phase.
3. Keep polishing the operator views where local stored state and worker live state can still diverge, especially around recovery and re-attachment flows.
4. Smoke test the new mixed Discord flow in a private guild after the worker-side gaps are smaller.
5. Prepare a fresh NAS bundle and redeploy after the Discord smoke succeeds.

## Operational notes

- Worker-side secrets, Codex auth, GitHub auth, and repo write access must stay on the worker PC.
- Real `.env` and `discord_nas_bridge/.env.nas` files must stay local and ignored.
- Runtime session state belongs under `.discord-bot-state/` and must not be committed.
- Before NAS upload, run `scripts/prepare-nas-bundle.ps1`.
- Do not run `docker compose config` with a real env file, because it can print secrets.

## Public repo note

The tracked repository should contain only:

- fake or synthetic IDs in examples and tests
- placeholder hostnames and secrets in example env files
- no real bot token
- no real shared secret
- no real private Discord identifiers
