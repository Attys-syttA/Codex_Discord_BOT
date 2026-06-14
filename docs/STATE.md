# Project State

## Current status

- Date: 2026-06-14
- Repository: `Codex_Discord_BOT`
- Phase: NAS Discord bridge container and auto forum workspace mapping smoke passed; stabilization checkpoint in progress
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
- GitHub Actions CI passed after the workspace tooling commit.
- NAS container runtime log showed `EACCES: permission denied, open '/app/package.json'` when starting with `npm run start` as the non-root `node` user.
- NAS Docker runtime was adjusted to start with `node dist/index.js` directly and make `/app` readable before switching to `USER node`.
- Fresh NAS log then showed `MODULE_NOT_FOUND: Cannot find module '/app/dist/index.js'`.
- The TypeScript build emits `dist/src/index.js` because `tsconfig.json` uses `rootDir: "."`; `package.json` and the NAS Docker `CMD` now use `node dist/src/index.js`.
- NAS container startup succeeded after the entrypoint fixes:
  - Exported NAS log shows `Discord bridge logged in as TEST_ONLY_DISCORD_BOT#0000`.
  - NAS runtime session store is `/data/sessions.json`.
  - NAS bridge is configured to use worker `otthon` at `http://worker-host.example:8787`.
- The previous local Discord dev bot process was stopped so the NAS container is the only active Discord bot instance.
- First NAS-hosted `/doctor` attempt timed out in Discord with `Az alkalmazás nem válaszolt`.
- The pre-diagnostics NAS log shows the real Discord API error was `DiscordAPIError[10062]: Unknown interaction`.
  - The `tts: false` line in the payload is not a TTS permission problem.
  - It indicates a normal non-TTS interaction response body.
- Fresh NAS diagnostics showed the interaction event was received, but `deferReply` reached Discord too late:
  - `Discord command received` at `17:57:43`.
  - `DiscordAPIError[10062]: Unknown interaction` during `deferReply` at `17:57:47`.
  - This points to slow NAS/container outbound REST callback, not missing Discord command permissions.
- Added minimal non-secret Discord interaction diagnostics:
  - logs when a slash command is received,
  - logs when the command is deferred/ACKed,
  - logs completion or failure with command/guild/channel/user identifiers.
- Interaction failure replies are now guarded so an expired interaction token is logged instead of surfacing as an unhandled client error.
- NAS runtime now sets `NODE_OPTIONS=--dns-result-order=ipv4first` in both the Dockerfile and compose file to avoid slow IPv6/DNS fallback before Discord REST callbacks.
- After the IPv4-first fix, `/doctor` and `/session` answered from the NAS-hosted bot, and `/new` reached the session store step.
- `/new` then failed with `EACCES: permission denied, open '/data/sessions.json'`.
  - This is a Synology bind-mount ownership issue for `./data:/data`.
  - The NAS runtime no longer switches to the non-root `node` user, so it can write its own `/data` state volume.
- Forum/channel auto workspace mapping was added:
  - explicit `DISCORD_CHANNEL_MAPPINGS_JSON` entries still win,
  - otherwise `DISCORD_AUTO_WORKSPACE_ROOT` plus the project forum/channel name is used,
  - for a forum post/thread, the parent forum name is used instead of the individual post title.
- The NAS deploy bundle under `discord_nas_bridge/app/` was regenerated after the diagnostics change.
- Fresh NAS deployment smoke confirmed the auto workspace mapping:
  - an unmapped forum thread under `codex_discord_bot` mapped to `<CODEX_WORKS_HOME>\codex_discord_bot`,
  - `/doctor` answered from the NAS-hosted bot,
  - worker health reported `remote-worker` through `http://worker-host.example:8787`.
- Stabilization verification passed after the auto mapping smoke:
  - `npm run check:workspace` passed,
  - `ggshield secret scan path --recursive --yes --use-gitignore .` found no secrets.
- Development order decision:
  - first close the current NAS/Discord stabilization checkpoint with verification, commit, and push,
  - next implement incremental Discord message editing/chunking for longer `/ask` responses,
  - then add a private Discord smoke checklist and session-store write hardening.
  - Defer plain message prompts, Message Content Intent, automatic forum creation, Wake-on-LAN, and multi-worker UX until after the checkpoint.
- Long `/ask` response chunking was added:
  - command handlers can now return multiple Discord response parts,
  - the first part edits the deferred interaction reply,
  - additional parts are sent as ephemeral follow-up messages,
  - long Codex text is split into Discord-safe chunks instead of being replaced by `[truncated]`.
- The `/ask` usage summary was clarified:
  - Discord now says `Codex tool calls` instead of generic `Tools`,
  - a failed count means an internal Codex tool call failed during the worker turn, not that the Discord bridge failed,
  - the NAS log records non-secret response delivery metadata as `Discord response sent ... parts=N`.
- Discord response visibility is now configurable:
  - `DISCORD_EPHEMERAL_RESPONSES=true` keeps private "only you can see this" responses,
  - `DISCORD_EPHEMERAL_RESPONSES=false` sends normal persistent thread messages,
  - the NAS example uses persistent responses because project work needs to be visible across desktop/mobile clients and after reopening Discord.
- Validation passed after this slice:
  - `npm test -- command-handlers`,
  - `npm run typecheck`,
  - `npm test`,
  - `npm run build`,
  - `npm run nas:bundle:prepare`,
  - `git diff --check`,
  - `docker build -f discord_nas_bridge\Dockerfile -t codex-discord-bridge:nas-bundle discord_nas_bridge`,
  - `npm run check:workspace`.

## Next steps

1. Set real NAS `.env.nas` to `DISCORD_EPHEMERAL_RESPONSES=false`.
2. Upload the refreshed `discord_nas_bridge/` folder including regenerated `app/` to the NAS and rebuild/restart the container.
3. Run a long `/ask` live smoke and confirm multiple persistent Discord messages appear without `[truncated]`.
4. Add a private Discord smoke checklist covering `/doctor`, `/new`, `/session`, `/ask`, `/abort`, and unmapped forum auto mapping.
5. Add file-locking or atomic write hardening for the session store if multiple bot processes are ever allowed.

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
