# Project State

## Current status

- Date: 2026-06-14
- Repository: `Codex_Discord_BOT`
- Phase: TypeScript skeleton
- Runtime code: skeleton only, no Discord Gateway login yet
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

## Next steps

1. Add Discord Gateway client startup and guild-scoped slash command registration.
2. Implement first config-only `/doctor` command skeleton.
3. Add session registry for Discord forum channel/thread contexts.
4. Wire `/workers`, `/session`, `/new`, `/attach`, `/handoff`, and `/abort` to the worker client.
5. Add private Discord smoke checklist before treating live behavior as done.

## Operational notes

- Telegram bridge remains separate and should not be modified as part of this scaffold.
- Worker-side secrets, Codex auth, GitHub auth, and repo write access must stay on the worker PC.
- Use guild-scoped Discord command registration during development.
- This folder is now a Git repository on `main`, tracking `origin/main` at `https://github.com/Attys-syttA/Codex_Discord_BOT.git`.
- The initial TypeScript skeleton is ready for the first repository commit and push.
- `.env.example` contains only fake placeholders and public/non-secret Discord IDs.

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
