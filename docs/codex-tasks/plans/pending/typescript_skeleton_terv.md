# TypeScript Skeleton Terv: `Codex_Discord_BOT`

## Summary

A skeleton célja egy különálló, moduláris Discord ChatOps bridge alap létrehozása, amely **nem Telegram-átírás**, hanem Discord-native modellre épül:

- Discord server/guild = vezérlőfelület
- Forum channel = repo/projekt
- Forum post/thread = Codex session vagy handoff lane
- NAS bridge = Discord adapter és worker-kliens
- Worker PC = tényleges Codex/Git/fájlrendszer végrehajtás

A skeleton még nem futtat éles botlogikát és nem indít Codexet. Csak a stabil alapokat hozza létre: config parsing, Discord context resolution, worker HTTP client, unit tests.

## Key Changes

- `package.json`
  - ES module TypeScript projekt.
  - Node.js baseline: `>=20`, kompatibilis a jelenlegi Node `v24.14.1` környezettel.
  - Dependency: `discord.js ^14.26.4`.
  - Dev dependencies: `typescript ^6.0.3`, `tsx ^4.22.4`, `vitest ^4.1.8`, `@types/node ^25.9.3`.
  - Scripts:
    - `npm run dev` -> `tsx src/index.ts`
    - `npm run build` -> `tsc`
    - `npm test` -> `vitest run`
    - `npm run typecheck` -> `tsc --noEmit`

- `tsconfig.json`
  - Strict TypeScript.
  - ES modules.
  - `src` bemenet, `dist` kimenet.
  - 2-space style-t támogató, explicit `.js` importokat megkövetelő setup.
  - `moduleResolution: "NodeNext"`, `module: "NodeNext"`.

- `vitest.config.ts`
  - `test/**/*.test.ts` pattern.
  - Node environment.
  - Nincs snapshot vagy browser teszt ebben a skeletonben.

- `.env.example`
  - Csak fake placeholder értékek.
  - Tartalmazza:
    - `DISCORD_TOKEN=TEST_ONLY_DISCORD_BOT_TOKEN`
    - `DISCORD_APPLICATION_ID=100000000000000010`
    - `DISCORD_GUILD_ID=100000000000000001`
    - `DISCORD_ALLOWED_USER_IDS=100000000000000999`
    - `DISCORD_CHANNEL_MAPPINGS_JSON=[...]`
    - `DISCORD_WORKERS_JSON=[...]`
    - `DISCORD_DEFAULT_WORKER_ID=otthon`
    - `DISCORD_WORKER_TIMEOUT_MS=120000`
  - Valódi token vagy worker secret nem kerül bele.

## Implementation Changes

- `src/config.ts`
  - Exportált típusok:
    - `DiscordBridgeConfig`
    - `DiscordChannelMapping`
    - `WorkerTarget`
  - `loadConfig(env?: NodeJS.ProcessEnv)` tiszta, tesztelhető parser.
  - Validálja:
    - Discord snowflake ID-k csak pozitív egész-stringek lehetnek.
    - `DISCORD_ALLOWED_USER_IDS` nem lehet üres.
    - `DISCORD_CHANNEL_MAPPINGS_JSON` JSON array.
    - Forum/project channel mapping kötelező mezői: `channelId`, `workspace`, `workerId`.
    - Worker mapping kötelező mezői: `id`, `label`, `baseUrl`.
    - `DISCORD_DEFAULT_WORKER_ID`, ha meg van adva, létező workerre mutasson.
  - Nem tölti be a `.env` fájlt automatikusan első körben; a skeleton parser tiszta marad. Később külön döntéssel jöhet dotenv vagy saját loader.

- `src/discord-context.ts`
  - Exportált típus:
    - `DiscordContextKey = string`
  - Exportált függvények:
    - `contextKeyFromIds(guildId, channelId, threadId?)`
    - `parseContextKey(key)`
    - `isThreadContextKey(key)`
    - `resolveProjectChannelId({ channelId, parentId, isThread })`
  - Döntött context formátum:
    - Project/forum szint: `guildId:channelId`
    - Forum post/thread szint: `guildId:parentChannelId:threadId`
  - Workspace mindig a project/forum channel ID-ből jön, nem user szövegből.

- `src/worker-client.ts`
  - AttysCodexBridge_NAS worker szerződéséhez kompatibilis kliens.
  - Exportált típusok:
    - `WorkerEnvelope<T>`
    - `WorkerSessionCreateResponse`
    - `WorkerSessionInfo`
    - `PromptStreamEvent`
  - Exportált class:
    - `WorkerClient`
  - Minimum metódusok:
    - `getHealth()`
    - `createSession(options?)`
    - `getSessionInfo(sessionId)`
    - `newThread(sessionId, body)`
    - `resumeThread(sessionId, threadId)`
    - `abort(sessionId)`
    - `prompt(sessionId, input, callbacks)`
  - Auth header:
    - Ha van `sharedSecret`, küldi: `x-telecodex-shared-secret`.
    - Header neve marad kompatibilis a meglévő workerrel.
  - Stream:
    - `/sessions/:sessionId/prompt` NDJSON streamet olvas.
    - Ismert eventek: `text_delta`, `tool_start`, `tool_update`, `tool_end`, `turn_complete`, `agent_end`, `error`.
  - Timeout:
    - `AbortController` alapú, default `120000 ms`.

- `src/index.ts`
  - Minimális entrypoint.
  - Betölti a configot és kiír egy tokenmentes indulási összefoglalót.
  - Nem loginol még Discordra, nem regisztrál slash commandot.

## Test Plan

- `test/config.test.ts`
  - Elfogadja a mostani valós, nem titkos Discord ID-ket.
  - Hibát dob üres `DISCORD_ALLOWED_USER_IDS` esetén.
  - Hibát dob rossz snowflake ID esetén.
  - Hibát dob invalid JSON channel mappingre.
  - Hibát dob ismeretlen default worker ID esetén.
  - Elfogad több worker targetet és csatorna mappinget.

- `test/discord-context.test.ts`
  - Project/forum context: `guildId:channelId`.
  - Thread/session context: `guildId:parentChannelId:threadId`.
  - Parse roundtrip működik.
  - Thread detection működik.
  - Forum thread parent ID-ből helyesen resolve-olja a project channelt.

- `test/worker-client.test.ts`
  - Mock HTTP serverrel ellenőrzi:
    - `/health` GET.
    - `/sessions/create` POST.
    - Shared-secret header küldése.
    - 401/500 válasz emberi hibává alakul.
    - NDJSON prompt stream eventek callbackekbe mennek.
    - Timeout megszakítja a túl lassú kérést.

- Ellenőrző parancsok implementáció után:
  - `npm install`
  - `npm test`
  - `npm run typecheck`
  - `npm run build`
  - `git status --short --branch`, ha addig Git repo lesz
  - `ggshield secret scan path --recursive --yes --use-gitignore .`, mert config/Discord/worker érintett

## Assumptions And Defaults

- MVP továbbra is slash-command alapú; `Message Content Intent` nem kell.
- A fórumcsatornás modell marad: projekt = forum channel, session = forum post/thread.
- A worker API első körben nem változik; a Discord bridge a meglévő AttysCodexBridge_NAS worker szerződéshez igazodik.
- A skeleton még nem tartalmaz `discord.js` Gateway login kódot és slash command registrationt; az a következő milestone.
- A repo jelenleg nem Git repo, ezért a skeleton létrehozása után külön lépés lesz a Git inicializálás vagy GitHub remote összekötés.
- A TypeScript skeleton moduláris marad, nem vesz át EMS-szerű egyfájlos botstruktúrát.
