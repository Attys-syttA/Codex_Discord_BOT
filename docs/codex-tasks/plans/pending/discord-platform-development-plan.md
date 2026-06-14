# Discord Platform Development Plan

Last updated: 2026-06-14

## 1. Goal

Build a separate Discord bridge for Codex remote control while preserving the proven NAS/worker split from AttysCodexBridge_NAS.

The Discord bridge should make project selection simpler:

- Discord channel maps to one fixed workspace/repo.
- Discord thread maps to one Codex session or handoff lane.
- Session selection remains explicit because one repo may have several active Codex threads.

Telegram remains a working fallback and reference implementation.

## 2. Platform Decision

Use Discord for the v2 pilot because its server/channel/thread model matches the desired workflow more naturally than Telegram groups/topics.

Official Discord surfaces to use:

- Gateway/WebSocket for events: <https://docs.discord.com/developers/events/gateway>
- Application commands for slash commands: <https://docs.discord.com/developers/interactions/application-commands>
- REST API with route/global rate limit handling: <https://docs.discord.com/developers/topics/rate-limits>

For a private personal server, Discord API limits are not expected to be the practical bottleneck. The main complexity is setup: application registration, bot permissions, command registration, gateway intents, and channel/thread permissions.

## 3. Architecture

The first implementation should have three layers:

1. Discord adapter
   - login with bot token
   - register guild-scoped slash commands during development
   - receive command interactions and selected message events
   - send replies, status updates, and thread messages

2. ChatOps core
   - resolve Discord channel/thread into a stable context key
   - map channel IDs to configured workspace/repo/worker targets
   - track session metadata
   - normalize command results independent of Discord-specific UI

3. Worker client
   - call the existing remote-worker style HTTP API used by AttysCodexBridge_NAS
   - keep Codex execution on the worker PC
   - stream Codex turn updates back to Discord in rate-limit-aware batches

Do not invent a new Codex execution layer in the first MVP.

## 4. MVP Behavior

Required slash commands:

- `/doctor`: show Discord bridge, worker, workspace mapping, and current session health.
- `/session`: show active thread/session for the current Discord channel/thread.
- `/new`: start a new Codex thread for the channel's configured workspace.
- `/attach`: attach an existing Codex thread ID to the current Discord thread.
- `/handoff`: show the command or metadata needed to resume the current thread from PC/Codex.
- `/abort`: stop the active Codex turn for the current session.
- `/workers`: list and select configured worker targets if more than one exists.

Required configuration:

- Discord token and application IDs in `.env`.
- Allowed Discord guild ID for development.
- Allowed user IDs or role IDs.
- Channel mapping from `channel_id` to workspace/repo/worker.
- Worker target list matching the current NAS/worker contract.

Recommended first context model:

- If a message or slash command is inside a Discord thread, context key is `channelId:threadId`.
- If it is directly in a project channel, context key is `channelId`.
- Workspace is resolved from the parent project channel, not from user text.

## 5. Security Model

The Discord bridge is a controller, not the trusted execution machine.

Rules:

- Store Discord tokens and worker shared secrets only in `.env`.
- Keep Codex auth, GitHub auth, and repository filesystem access on the worker PC.
- Do not log raw tokens, shared secrets, or full private prompts.
- Use role/user allowlists before accepting commands.
- Use guild-scoped command registration during development.
- Avoid Message Content Intent in the first MVP unless plain non-slash prompts are intentionally added.

## 6. Implementation Milestones

Milestone 0: scaffold and project rules

- Create repo folder, README, AGENTS, plan, STATE, changelog, gitignore.
- No runtime bot code yet.

Milestone 1: TypeScript project skeleton

- Add `package.json`, `tsconfig.json`, Vitest config, and empty `src/`.
- Add config parser with tests for Discord IDs, worker targets, and channel mappings.
- Add `.env.example` with fake placeholders only.

Milestone 2: Discord command skeleton

- Add `discord.js` client startup.
- Register guild-scoped slash commands.
- Implement `/doctor` with mocked or config-only health output.

Milestone 3: worker integration

- Add remote worker client compatible with AttysCodexBridge_NAS worker endpoints.
- Implement `/workers`, `/session`, `/new`, `/attach`.
- Add tests with mocked HTTP worker responses.

Milestone 4: streamed Codex turns

- Send user prompts to worker.
- Stream assistant/tool updates back to Discord with debounced edits or message chunks.
- Implement `/abort` and error recovery.

Milestone 5: handoff and operational polish

- Implement `/handoff`.
- Add worker unreachable messaging and later Wake-on-LAN hooks.
- Add NAS deployment notes and private-server smoke checklist.

## 7. Test Plan

Docs/scaffold:

- `git status --short --branch`
- inspect generated files
- `git diff --check` once this folder is a Git repository
- `ggshield secret scan path --recursive --yes --use-gitignore .` before first meaningful commit

Implementation:

- config parser unit tests for `channel_id -> workspace/repo/worker`
- command handler unit tests with mocked Discord interactions
- worker client tests with mocked HTTP server
- session registry tests for `channelId` and `channelId:threadId`
- manual private Discord smoke: `/doctor`, `/new`, `/session`, prompt roundtrip, `/abort`

## 8. Open Decisions

- Exact Discord server/channel naming convention.
- Whether plain messages outside slash commands should become Codex prompts in MVP.
- Whether MVP needs Discord Message Content Intent or can stay slash-command-only.
- Whether the first deployment is NAS Docker, direct Node process, or both.
- Whether to share code with AttysCodexBridge_NAS later or keep the pilot separate until the interface stabilizes.
