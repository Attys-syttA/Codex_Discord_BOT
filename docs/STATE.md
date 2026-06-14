# Project State

## Current status

- Date: 2026-06-14
- Repository: `Codex_Discord_BOT`
- Phase: Discord command skeleton
- Runtime code: Gateway client and guild slash command skeleton available, gated by env flags
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

## Next steps

1. Create local `.env` from `.env.example` outside Git and add the real Discord token.
2. Register guild-scoped slash commands against `Private Discord Server`.
3. Run a private Discord smoke test for `/doctor`, `/session`, `/workers`, `/new`, `/attach`, and `/handoff`.
4. Wire `/new`, `/session`, `/abort`, and later prompt streaming to real worker sessions.
5. Add private Discord smoke checklist before treating live behavior as done.

## Operational notes

- Telegram bridge remains separate and should not be modified as part of this scaffold.
- Worker-side secrets, Codex auth, GitHub auth, and repo write access must stay on the worker PC.
- Use guild-scoped Discord command registration during development.
- This folder is now a Git repository on `main`, tracking `origin/main` at `https://github.com/Attys-syttA/Codex_Discord_BOT.git`.
- The initial TypeScript skeleton is ready for the first repository commit and push.
- `.env.example` contains only fake placeholders and public/non-secret Discord IDs.
- The real `.env` must stay local and ignored; `DISCORD_LOGIN` and `DISCORD_REGISTER_COMMANDS` default to `false`.

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
