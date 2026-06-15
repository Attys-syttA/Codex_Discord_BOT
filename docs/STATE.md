# Project State

## Current status

- Date: 2026-06-15
- Repository: `Codex_Discord_BOT`
- Phase: Discord bridge stabilization and public-repo cleanup
- Runtime code: slash commands, worker-backed session handling, file-backed session registry, NAS Docker bridge
- Primary direction: separate Discord pilot, not a Telegram rewrite

## Current goal

Make the repository safe to publish without breaking the current bot behavior.

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
- Core runtime capabilities are in place:
  - `/doctor`, `/session`, `/workers`, `/new`, `/attach`, `/handoff`, `/abort`, `/ask`
  - `/ask` streams worker output into bounded Discord-safe responses
  - long `/ask` answers are chunked into multiple Discord messages
  - session mappings persist in `.discord-bot-state/sessions.json`
- NAS runtime support is in place:
  - Docker-based NAS bridge under `discord_nas_bridge/`
  - generated deploy bundle under `discord_nas_bridge/app/`
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

## Next steps

1. Commit the current cleaned working tree.
2. Force-push the rewritten `main` branch to GitHub.
3. After the push, verify the remote GitHub UI and then rotate anything that may ever have been exposed outside ignored local env files.

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
