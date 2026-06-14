# Project State

## Current status

- Date: 2026-06-14
- Repository: `Codex_Discord_BOT`
- Phase: Discord `/ask` live smoke passed; response formatting hardening in progress
- Runtime code: Gateway client and guild slash command skeleton available, with worker-backed `/new`, `/attach`, `/session`, `/abort`, and `/ask`; runtime session mappings can persist to `.discord-bot-state/sessions.json`
- Primary direction: separate Discord pilot, not a Telegram rewrite

## Current goal

Build the first TypeScript skeleton for a Discord-based Codex control bridge.

The planned model is:

- Discord server = Codex control surface
- Discord channel = fixed repo/workspace
- Discord thread = Codex session or handoff lane
- NAS bridge = always-on chat bridge
- worker PC = Codex/Git/filesystem execution environment

## Completed

- Initial project rules defined in `AGENTS.md`.
- Discord platform plan defined in `docs/discord-platform-development-plan.md`.
- Basic README and gitignore created.
- Changelog started.
- Secret scan completed with no findings.
- Discord Developer Portal application and bot created as `TEST_ONLY_DISCORD_BOT`.
- Private Discord server `Private Discord Server` created and the bot added to it.
- First forum-style project channels/posts created for the Discord pilot.
- TypeScript ES module skeleton created with `discord.js`, Vitest, strict `tsconfig.json`, and `package-lock.json`.
- Config parser, Discord context helpers, and AttysCodexBridge-compatible worker client created under `src/`.
- Unit tests added for config parsing, Discord context keys, and worker-client HTTP/NDJSON behavior.
- Validation passed: `npm test`, `npm run typecheck`, `npm run build`, and `ggshield secret scan path --recursive --yes --use-gitignore .`.
- Optional `.env` loader added for local runtime without committing secrets.
- Guild-scoped slash command definitions added for `/doctor`, `/session`, `/workers`, `/new`, `/attach`, `/handoff`, and `/abort`.
- Discord Gateway client adapter added behind `DISCORD_LOGIN=true`; command registration is behind `DISCORD_REGISTER_COMMANDS=true`.
- In-memory session registry and testable command handler core added for mapped forum channel/thread contexts.
- Config-only command behavior is implemented for `/doctor`, `/session`, `/workers`, `/new`, `/attach`, `/handoff`, and `/abort` placeholders.
- Validation passed after this slice: `npm test` (27 tests), `npm run typecheck`, `npm run build`, and `ggshield secret scan path --recursive --yes --use-gitignore .`.
- Worker-backed command behavior added:
  - `/new` creates a worker session and starts a new Codex thread for the mapped workspace.
  - `/attach` creates or reuses a worker session and resumes the requested Codex thread.
  - `/session` refreshes live worker session info when a worker session is known.
  - `/abort` calls the worker abort endpoint for the recorded worker session.
- Validation passed after this slice: `npm test` (29 tests), `npm run typecheck`, `npm run build`, and `ggshield secret scan path --recursive --yes --use-gitignore .`.
- Prompt submission command added:
  - `/ask` sends a prompt to the active worker session for the current mapped Discord context.
  - The command requires an existing `/new` or `/attach` session and does not require Discord Message Content Intent.
  - Worker text deltas, tool start/end events, and token usage are summarized into a bounded Discord response.
- Validation passed after this slice: `npm test` (31 tests), `npm run typecheck`, `npm run build`, and `ggshield secret scan path --recursive --yes --use-gitignore .`.
- Durable session registry added:
  - `FileSessionRegistry` stores Discord context to worker/Codex session mappings in local JSON.
  - `DISCORD_SESSION_STORE_PATH` defaults to `.discord-bot-state/sessions.json`, which is ignored by Git.
  - Runtime bot login now uses the file-backed registry so mappings survive process restarts.
- Validation passed after this slice: `npm test` (33 tests), `npm run typecheck`, `npm run build`, and `ggshield secret scan path --recursive --yes --use-gitignore .`.
- Live Discord smoke passed locally:
  - Guild-scoped commands registered successfully.
  - Bot logged in as `TEST_ONLY_DISCORD_BOT#0000`.
  - `/doctor` reported `Worker health: remote-worker`.
  - `/new` created a worker session.
  - `/session` reported the worker session as reachable.
- NAS Docker bridge scaffold added under `discord_nas_bridge/`:
  - Docker runtime uses `restart: unless-stopped`.
  - NAS env example is separate from local `.env`.
  - Runtime state is mounted under `/data`.
- Validation passed after this slice: `npm test` (33 tests), `npm run typecheck`, `npm run build`, `docker compose -f discord_nas_bridge/docker-compose.yml config` with temporary example env, and `ggshield secret scan path --recursive --yes --use-gitignore .`.
- Docker image build was re-run after Docker Desktop startup and completed successfully:
  - `docker build -f discord_nas_bridge/Dockerfile -t codex-discord-bridge:local .`
- Warning: `docker compose config` can print real env values, including tokens and shared secrets. Use it only with fake/example env values.
- `/ask` live smoke found a payload mismatch:
  - Worker expected `CodexPromptInput` as a string or `{ text: "..." }`.
  - Discord bridge previously sent `{ prompt: "..." }`, so Codex CLI received empty stdin.
  - The command handler now sends `{ text: prompt }`.
- Validation passed after this slice: `npm test` (33 tests), `npm run typecheck`, and `npm run build`.
- Discord token was rotated after the accidental real-env `docker compose config` output.
- `/ask` live smoke passed after the payload fix and returned a Codex response through Discord.
- `/ask` response formatting was hardened to avoid exposing raw worker command lines in Discord:
  - Tool details are summarized as event and failure counts.
  - Raw PowerShell/Git command strings are not included in the bridge summary.
- Validation passed after this slice: `npm test` (34 tests), `npm run typecheck`, and `npm run build`.

## Next steps

1. Restart the local Discord bot after the response-formatting commit and retry `/ask`.
2. Prepare NAS deployment handoff: copy `discord_nas_bridge/` files to NAS and keep `DISCORD_WORKERS_JSON` pointed at `http://worker-host.example:8787`.
3. Add incremental Discord message editing/chunking for long streamed `/ask` responses.
4. Add file-locking or atomic write hardening for the session store if multiple bot processes are ever allowed.
5. Add private Discord smoke checklist before treating live behavior as done.

## Operational notes

- Telegram bridge remains separate and should not be modified as part of this scaffold.
- Worker-side secrets, Codex auth, GitHub auth, and repo write access must stay on the worker PC.
- Use guild-scoped Discord command registration during development.
- This folder is now a Git repository on `main`, tracking `origin/main` at `https://github.com/Attys-syttA/Codex_Discord_BOT.git`.
- The initial TypeScript skeleton is ready for the first repository commit and push.
- `.env.example` contains only fake placeholders and public/non-secret Discord IDs.
- The real `.env` must stay local and ignored; `DISCORD_LOGIN` and `DISCORD_REGISTER_COMMANDS` default to `false`.
- Runtime session state belongs under `.discord-bot-state/` by default and must not be committed.
- NAS runtime files belong under `discord_nas_bridge/`; real `discord_nas_bridge/.env.nas` and `discord_nas_bridge/data/` runtime contents must not be committed.
- Do not run `docker compose config` with a real `.env` or `.env.nas`; it can print secrets to the terminal/log.

## Discord pilot identifiers

- Discord guild/server: `Private Discord Server`
- Discord guild/server ID: `100000000000000001`
- Bot application/user: `TEST_ONLY_DISCORD_BOT`
- Bot application/user ID: `100000000000000010`
- Owner/test user: `test_operator`
- Owner/test user ID: `100000000000000999`
- Project forum channel: `codex-discord-bot`
- Project forum channel ID: `100000000000000101`
- Initial forum post/thread: `start`
- Initial forum post/thread ID: `100000000000000201`
