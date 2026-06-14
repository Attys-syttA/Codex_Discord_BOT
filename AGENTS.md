# Repository Guidelines

## 1. Scope

This repository is the dedicated Discord pilot for Codex remote control:

- local path: `<CODEX_WORKS_HOME>\Codex_Discord_BOT`
- intended GitHub repository name: `Codex_Discord_BOT`

Treat it as a separate repository from `AttysCodexBridge_NAS`. The Telegram bridge is a reference and fallback, not a folder to edit from this project unless the user explicitly asks for cross-repo work.

## 2. Project Role

Codex_Discord_BOT is a Discord ChatOps bridge.

The planned runtime shape is:

- Discord server = Codex control surface
- Discord channel = fixed repo/workspace
- Discord thread = Codex session or handoff lane
- NAS-side bot = always-on bridge
- worker PC = real Codex, Git, filesystem, and GitHub-write environment

Do not move worker-side secrets, Codex auth, GitHub auth, or local repository write access into the Discord/NAS bridge.

## 3. Startup and Workspace Safety

Before modifying files:

- follow the parent `E:\codex_works\AGENTS.md` Windows MCP / Serena startup hygiene rules
- run `git status` if this folder is a Git repository
- identify whether the change is docs-only, scaffold, implementation, or cross-repo
- inspect existing files before changing them

If work touches both this repository and `AttysCodexBridge_NAS`, state the primary repository and keep commits separate.

## 4. Coding Defaults

Use the same technical baseline as AttysCodexBridge:

- Node.js 20+
- TypeScript with ES modules
- 2-space indentation
- double quotes
- semicolons
- explicit `.js` import specifiers in TypeScript source
- `src/` for runtime code, `test/` for Vitest tests, `dist/` for build output

Prefer `discord.js` v14 for Discord integration unless a later plan explicitly changes this.

## 5. Documentation and State

Keep these files aligned with reality:

- `docs/STATE.md`
- `docs/CHANGELOG.dev.md`
- active plans under `docs/`

After each completed task, append a short Hungarian entry to `docs/CHANGELOG.dev.md` with:

- date/time
- goal
- changed files
- commands/checks run
- result
- open follow-up

Update `docs/STATE.md` after meaningful changes, failed attempts, test runs, or project state changes.

## 6. Security and Sensitive Data

Never commit:

- Discord bot tokens
- Telegram tokens copied from the old project
- worker shared secrets
- API keys
- GitHub credentials
- Codex auth state
- `.env`
- runtime session state
- logs that contain private prompts, repo paths, tokens, or user data

Use `.env.example` for fake configuration only. Use obviously fake placeholders such as `TEST_ONLY_*` in tests.

Before meaningful commits that touch auth, tokens, config, Discord integration, worker communication, Docker, CI, examples, or tests, run:

```powershell
ggshield secret scan path --recursive --yes --use-gitignore .
```

If a full scan is too slow, scan only the modified paths and record that choice in the changelog.

## 7. Discord-Specific Rules

Use official Discord concepts accurately:

- Gateway/WebSocket receives events.
- REST API sends messages, edits, and command registration calls.
- Slash commands are the primary command surface.
- Privileged intents must be enabled only when the implementation really needs them.
- Message Content Intent should not be required for MVP slash-command flows unless plain text prompts outside slash commands are explicitly implemented.

The MVP should prefer:

- slash commands for control actions
- channel mapping for repo/workspace selection
- Discord threads for session continuity
- clear error messages when the worker is asleep or unreachable

## 8. Testing and Validation

For docs-only scaffold changes:

- run `git status --short --branch` when the repo exists
- inspect changed files
- run `git diff --check` when the folder is a Git repository

For implementation changes:

- add or update Vitest tests next to behavior changes
- run targeted tests first
- run `npm test` and `npm run build` before a stable checkpoint
- manually smoke test against a private Discord server before treating Discord behavior as done

## 9. Versioning and Release

No npm release workflow exists yet.

Do not publish packages, register production Discord commands globally, or deploy to NAS unless the user explicitly asks. Prefer guild-scoped Discord command registration during development.

## 10. What Not To Do

- Do not rewrite the Telegram bridge as part of this project start.
- Do not copy `.env` files from `AttysCodexBridge_NAS`.
- Do not hard-code channel IDs, worker URLs, tokens, or local user paths in source.
- Do not add autonomous repo-write behavior without explicit user approval.
- Do not skip state/changelog updates for completed tasks.
