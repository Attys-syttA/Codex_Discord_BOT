# Project State

## Current status

- Date: 2026-06-14
- Repository: `Codex_Discord_BOT`
- Phase: Discord `/ask` live smoke passed; GitHub/CI workspace tooling in progress
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
- `/ask` prompts now include a short policy preamble telling Codex to prefer `docs/STATE.md` current status and treat older append-only changelog follow-up lines as historical notes.
- Fresh `/new` + `/ask` live smoke passed after the policy preamble update and local bot restart:
  - A new worker session was created for the Discord forum thread.
  - `/ask` returned a current repo status answer through Discord.
  - Tool activity is summarized by event/failure counts instead of raw command lines.
- NAS Docker scaffold was adjusted for Synology File Station style upload:
  - `docker-compose.yml` now builds from the uploaded `discord_nas_bridge/` folder itself.
  - `scripts/prepare-nas-bundle.ps1` generates a local `discord_nas_bridge/app/` deploy bundle from `package*.json`, `tsconfig.json`, and `src/`.
  - `discord_nas_bridge/.dockerignore` excludes real env files and runtime data from Docker build context.
  - Local validation passed with `docker build -f discord_nas_bridge/Dockerfile -t codex-discord-bridge:nas-bundle discord_nas_bridge`.
- Git/GitHub check workspace tooling added:
  - `npm run check:workspace` runs local typecheck, tests, build, NAS bundle, Docker build when available, whitespace check, and `ggshield` when available.
  - `npm run nas:bundle:prepare` uses a cross-platform Node script so GitHub Actions and Windows can generate the same NAS bundle.
  - `.github/workflows/ci.yml` runs Node 20 CI checks and NAS Docker build on push, pull request, and manual dispatch.
  - Dependabot is configured for npm and GitHub Actions updates.
  - `.github/SECURITY.md` documents private vulnerability reporting expectations.

## Next steps

1. Commit/push the GitHub/CI workspace tooling and confirm the first GitHub Actions run.
2. Upload the refreshed `discord_nas_bridge/` folder to the NAS including the generated `app/` subfolder, then run `docker compose up -d --build` from that NAS folder.
3. Keep NAS `DISCORD_WORKERS_JSON` pointed at `http://worker-host.example:8787` while the worker runs on the home PC.
4. Add incremental Discord message editing/chunking for long streamed `/ask` responses.
5. Add file-locking or atomic write hardening for the session store if multiple bot processes are ever allowed.
6. Add private Discord smoke checklist before treating live behavior as done.

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
- Before NAS upload, run `scripts/prepare-nas-bundle.ps1`; the generated `discord_nas_bridge/app/` folder is ignored by Git but must be uploaded to the NAS.
- For full local verification, run `npm run check:workspace`.

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
