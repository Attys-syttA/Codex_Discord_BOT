# Repository Guidelines

## 1. Scope

This repository is the dedicated Discord pilot for Codex remote control:

- local path: `<CODEX_WORKS>\Codex_Discord_BOT`
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

- follow the parent `<CODEX_WORKS>\AGENTS.md` Windows MCP / Serena startup hygiene rules
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

## 5.1 Task And Plan Files

The repository-local plan and task memory lives under `docs/codex-tasks/`.

Plan lifecycle:

- active or not-yet-finished plans belong under `docs/codex-tasks/plans/pending/`
- closed plans belong under `docs/codex-tasks/plans/done/`
- background notes, comparisons, imported research, and decision support material belong under `docs/codex-tasks/plans/pending/reference/`

Pending plan folders:

- `docs/codex-tasks/plans/pending/active/`: active or partly implemented main directions
- `docs/codex-tasks/plans/pending/not-started/`: not yet started plans
- `docs/codex-tasks/plans/pending/reference/`: supporting notes and research material

Rules:

- if a plan becomes the active implementation guide, move it under `pending/active/`
- if a plan is finished or only historical, move it under `plans/done/`
- do not leave an active plan in a generic top-level folder when its state is already known
- if a file is mainly comparison or imported research material, do not treat it as an active plan

Active plan files under `pending` must begin with a short status block. Minimum sections:

- `Allapot`
- `Kapcsolodo jelenlegi helyzet`
- `Elkeszult reszek`
- `Nyitott reszek`

Use `docs/TERV_STATUS_SABLON.md` as the repository-local template.

Automation rule:

- run `npm run plans:check` when active plan files were added, moved, or edited
- `scripts/check-workspace.ps1` must keep this check enabled so plan drift is caught together with build/test/inventory drift

When implementation progress changes materially:

- update the plan's `Elkeszult reszek`
- update the plan's `Nyitott reszek`
- keep the plan aligned with the actual repository state, not the old intention

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

This repository is now intended to stay safe for a public GitHub remote.

That means:

- do not re-introduce real Discord IDs, real user IDs, real bot names, private LAN or home IP examples, machine-local personal paths, operator names, real hostnames, or credential-like sample values into tracked files
- examples, docs, tests, fixtures, screenshots, and sample commands must use synthetic or clearly placeholder values
- if a change touches config, docs, tests, Docker, examples, IDs, URLs, tokens, secrets, or machine paths, explicitly re-check that no realistic private value slipped back in before treating the task as done
- if a value looks even slightly real, replace it with a clearly fake placeholder instead of "probably okay" text
- never rely only on `.gitignore` for protection when a tracked example, doc, or test can still expose sensitive operational detail

Before meaningful commits that touch auth, tokens, config, Discord integration, worker communication, Docker, CI, examples, or tests, run:

```powershell
ggshield secret scan path --recursive --yes --use-gitignore .
```

If a full scan is too slow, scan only the modified paths and record that choice in the changelog.

### Public Repo Spot-Check

Before commit, if the change touched docs, tests, examples, config, Docker, screenshots, or command samples, do a short manual spot-check on the changed files for these patterns:

- real Discord IDs or user IDs
- real bot token, worker secret, API key, or credential-like sample value
- private LAN, home, NAS, or workplace IP/host example
- machine-local personal path such as `C:\Users\...`, `D:\...`, `E:\...` when it reflects a real setup instead of a clearly fake example
- real operator name, account name, or personal identifier
- copied terminal output that may contain private repo paths, thread IDs, prompts, or runtime state

Preferred replacements:

- use `1000000000000000001` style synthetic Discord snowflakes
- use `TEST_ONLY_*` style placeholders for tokens and secrets
- use neutral hostnames such as `example-host`, `HOME_WORKER_IP`, `WORK_WORKER_IP`
- use neutral paths such as `C:\workspace\ProjectName`

Recommended quick commands before commit when the touched files make this relevant:

```powershell
git diff --name-only
rg -n "100000000000000000|TEST_ONLY_|HOME_WORKER_IP|WORK_WORKER_IP|C:\\workspace" .
rg -n "token|secret|password|apikey|api_key|sharedSecret|shared_secret|x-telecodex-shared-secret" .
```

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

## 8.1 NAS Bundle Inventory Discipline

If a new repository file is added, or an existing file is renamed, moved, or its NAS bundle role changes, update the versioned NAS inventory before considering the task done.

- This is a mandatory close-out rule, not an optional packaging reminder.
- The practical trigger is simple: if the repository file layout changed in any way, assume the inventory may need an update.
- Run `npm run nas:inventory:write` after the file-layout change so `nas-runtime-inventory.json` stays current.
- Run `npm run nas:inventory:check` before commit/merge or before rebuilding the NAS upload bundle.
- Run `npm run nas:bundle:check` before `npm run nas:bundle:prepare` when the NAS payload logic changed.
- `needs-classification` drift must not remain before commit/merge.
- A task that adds, renames, moves, or reclassifies files is not considered finished until the inventory is green again.
- Local env files, secrets, logs, runtime state, generated `discord_nas_bridge/app/`, and NAS `data/` state must not become source-of-truth inventory payload.

## 9. Versioning and Release

No npm release workflow exists yet.

Do not publish packages, register production Discord commands globally, or deploy to NAS unless the user explicitly asks. Prefer guild-scoped Discord command registration during development.

## 10. What Not To Do

- Do not rewrite the Telegram bridge as part of this project start.
- Do not copy `.env` files from `AttysCodexBridge_NAS`.
- Do not hard-code channel IDs, worker URLs, tokens, or local user paths in source.
- Do not add autonomous repo-write behavior without explicit user approval.
- Do not skip state/changelog updates for completed tasks.
