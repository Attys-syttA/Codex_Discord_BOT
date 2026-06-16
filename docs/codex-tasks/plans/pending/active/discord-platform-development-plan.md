# Plan: Initial Discord platform development direction for `Codex_Discord_BOT`

Allapot: pending / reszben megvalosult aktiv foirany

Kapcsolodo jelenlegi helyzet:
- This document is the original project-starting plan for the repository.
- The repository has already moved beyond several early MVP assumptions from this plan.
- It remains useful as the base architectural intent, but it no longer describes the full current scope on its own.

Elkeszult reszek:
- A separate Discord bridge architecture exists.
- Worker HTTP connectivity and session/state handling exist beyond the first skeleton level.
- The pilot already expanded from slash-only control toward mixed slash plus normal message flow.
- NAS bundle preparation now has inventory-based checks and packaging discipline.
- Session views have started moving beyond pure local storage by incorporating worker-reported live status and session lists where available.
- The approval baseline now includes expiry handling, audit logging, and Discord message-to-approval persistence.
- The bridge now also has:
  - queue plus approval coordination on the local Discord side
  - stronger `/doctor`, `/last`, `/session`, and `/sessions` operator views
  - visible local-versus-worker thread drift hints for recovery-style troubleshooting

Nyitott reszek:
- Private Discord guild smoke testing for the full mixed flow.
- Worker-side completion of the optional endpoints that the bridge can already call conceptually.
- Harmonizing this original plan with the broader control-center plan so the two documents do not drift apart.

## Summary

This is the original foundation plan that started the Discord pilot. Its role is to explain the first stable direction:

- build a separate Discord bridge for Codex remote control
- preserve the NAS/worker split proven in the Telegram-based line
- keep the worker PC as the real execution environment
- use Discord channels and threads as the control surface

This document is still valuable because it captures the architectural intent clearly. The newer wider plan builds on top of this one rather than replacing its core trust model.

## Original goal

Build a separate Discord bridge for Codex remote control while preserving the proven NAS/worker split from `AttysCodexBridge_NAS`.

The intended project-selection model is:

- one Discord channel maps to one fixed workspace or repository
- one Discord thread maps to one Codex session or handoff lane
- session selection stays explicit because one repository may have several active Codex threads

Telegram remains a working fallback and reference implementation, but not the primary target of this repository.

## Platform decision

Discord was chosen for the v2 pilot because its server/channel/thread model matches the desired workflow more naturally than Telegram groups and topics.

Important Discord surfaces:

- Gateway/WebSocket for events
- application commands for slash commands
- REST API for replies, edits, and registration work

For a private personal server, Discord API limits are not expected to be the real bottleneck. The more important complexity is:

- application registration
- bot permissions
- command registration
- gateway intents
- channel and thread permissions

## Base architecture

The first stable implementation direction uses three layers:

### 1. Discord adapter

- log in with the bot token
- register guild-scoped slash commands during development
- receive command interactions and selected message events
- send replies, status updates, and thread messages

### 2. ChatOps core

- resolve a Discord channel/thread into a stable context key
- map channel IDs to configured workspace/repository/worker targets
- track session metadata
- normalize command results independently from Discord-specific rendering

### 3. Worker client

- call the existing remote-worker style HTTP API used by `AttysCodexBridge_NAS`
- keep Codex execution on the worker PC
- return or stream Codex turn updates back to Discord in rate-aware batches

The important rule here is unchanged: do not invent a brand-new Codex execution layer in the first MVP.

## MVP behavior

### Required command coverage

The original MVP expected these core commands:

- `/doctor`
- `/session`
- `/new`
- `/attach`
- `/handoff`
- `/abort`
- `/workers`

Since then the repository has already expanded beyond this list, but these commands still describe the original minimum control loop:

- inspect health
- start or attach a session
- stop a run
- hand work back to the worker machine
- see or choose workers

### Required configuration

The original baseline configuration included:

- Discord token and application IDs in `.env`
- allowed Discord guild ID for development
- allowed user IDs or role IDs
- channel mapping from `channel_id` to workspace/repository/worker
- worker target list matching the current NAS/worker contract

### Recommended first context model

- if a slash command or message is inside a Discord thread, the context key is `channelId:threadId`
- if it is directly in a project channel, the context key is `channelId`
- workspace comes from the parent project channel, not from free-form user text

This part still matters because the newer broader plan keeps this exact mental model.

## Security model

The Discord bridge is a controller, not the trusted execution machine.

Rules:

- store Discord tokens and worker shared secrets only in `.env`
- keep Codex auth, GitHub auth, and repository filesystem access on the worker PC
- do not log raw tokens, shared secrets, or full private prompts
- use role/user allowlists before accepting commands
- use guild-scoped command registration during development
- avoid Message Content Intent in the earliest MVP unless normal non-slash prompts are intentionally added

One thing has changed since this was first written: the repository has already moved toward mixed prompt handling, so Message Content Intent is no longer only a hypothetical future question.

## Milestones in the original plan

### Milestone 0: scaffold and project rules

- create repository folder, README, AGENTS, plan, STATE, changelog, gitignore
- no runtime bot code yet

### Milestone 1: TypeScript project skeleton

- add `package.json`, `tsconfig.json`, Vitest config, and `src/`
- add config parsing with tests for Discord IDs, worker targets, and channel mappings
- add `.env.example` with fake placeholders only

### Milestone 2: Discord command skeleton

- add `discord.js` client startup
- register guild-scoped slash commands
- implement `/doctor` with mocked or config-only health output

### Milestone 3: worker integration

- add a remote worker client compatible with `AttysCodexBridge_NAS`
- implement `/workers`, `/session`, `/new`, `/attach`
- add tests with mocked HTTP worker responses

### Milestone 4: streamed Codex turns

- send user prompts to the worker
- stream assistant/tool updates back to Discord with debounced edits or message chunks
- implement `/abort` and error recovery

### Milestone 5: handoff and operational polish

- implement `/handoff`
- add worker-unreachable messaging and later Wake-on-LAN hooks
- add NAS deployment notes and a private-server smoke checklist

## Test expectations

### Docs and scaffold level

- `git status --short --branch`
- inspect generated files
- `git diff --check` once the folder is a Git repository
- `ggshield secret scan path --recursive --yes --use-gitignore .` before the first meaningful commit

### Implementation level

- config parser unit tests for `channel_id -> workspace/repo/worker`
- command handler unit tests with mocked Discord interactions
- worker client tests with mocked HTTP behavior
- session registry tests for `channelId` and `channelId:threadId`
- manual private Discord smoke:
  - `/doctor`
  - `/new`
  - `/session`
  - prompt roundtrip
  - `/abort`

## Open decisions recorded by the original plan

- exact Discord server/channel naming convention
- whether plain messages outside slash commands should become Codex prompts in the MVP
- whether Message Content Intent is required
- whether the first deployment target is NAS Docker, direct Node process, or both
- whether code should later be shared with `AttysCodexBridge_NAS` or stay separate until the interface stabilizes

## Current role of this plan

Today this file should be read as:

- the original architectural baseline
- the simpler pilot-level contract
- the document that explains why the project is Discord-first and worker-trusting

The broader active plan should be treated as the current expansion path:

- [Terv_Codex_Discord_BOT_fejlesztés.md](d:/codex_works/Codex_Discord_BOT/docs/codex-tasks/plans/pending/active/Terv_Codex_Discord_BOT_fejlesztés.md)
