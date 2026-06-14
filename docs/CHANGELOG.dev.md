# CHANGELOG.dev.md

Append-only development log for `Codex_Discord_BOT`.

## 2026-06-14 09:45 +02:00

- Cel: Uj `Codex_Discord_BOT` projektmappa es Discord platformterv scaffold letrehozasa.
- Modositott fajlok: `.gitignore`, `AGENTS.md`, `README.md`, `docs/discord-platform-development-plan.md`, `docs/STATE.md`, `docs/CHANGELOG.dev.md`.
- Futtatott parancsok: MCP/Serena process check; `mcp__serena.initial_instructions` probalkozas (`Transport closed`); celmappa ellenorzes; `git status --short --branch` az `AttysCodexBridge_NAS` repoban; uj mappa file-lista; `git status --short --branch` az uj mappaban (meg nem Git repo); celzott `rg` secret-pattern keresés; `ggshield secret scan path --recursive --yes --use-gitignore .`.
- Eredmeny: A projekt docs-first scaffoldja elkeszult; runtime Discord bot kod meg nem keszult; `ggshield` nem talalt secretet.
- Nyitott follow-up: GitHub repo osszekotes/init, TypeScript skeleton, `.env.example`, Discord config parser es elso `/doctor` command.

## 2026-06-14 12:00 +02:00

- Cel: Discord Developer Portal es privát `Private Discord Server` szerver alapbeallitasainak rogzitese.
- Modositott fajlok: `docs/STATE.md`, `docs/CHANGELOG.dev.md`.
- Futtatott parancsok: MCP/Serena process check korabban ebben a sessionben; `git status --short --branch` az uj mappaban (meg nem Git repo); `Get-Content` a state/changelog fajlokra.
- Eredmeny: A `TEST_ONLY_DISCORD_BOT` bot hozza lett adva a `Private Discord Server` szerverhez; a szerver, bot, tulajdonos, forumcsatorna es elso forum thread azonositoi bekerultek a state fajlba. Token vagy secret nem kerult rogzitesre.
- Nyitott follow-up: Git repo inicializalas/remote osszekotes, TypeScript skeleton, `.env.example`, config parser, guild-scoped slash command regisztracio.

## 2026-06-14 12:25 +02:00

- Cel: A `docs/codex-tasks/plans/pending/typescript_skeleton_terv.md` terv szerinti TypeScript skeleton letrehozasa.
- Modositott fajlok: `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `src/config.ts`, `src/discord-context.ts`, `src/worker-client.ts`, `src/index.ts`, `test/config.test.ts`, `test/discord-context.test.ts`, `test/worker-client.test.ts`, `docs/STATE.md`, `docs/CHANGELOG.dev.md`.
- Futtatott parancsok: `git status --short --branch` (a mappa meg nem Git repo); `npm install`; `npm test`; `npm run typecheck`; `npm run build`; `ggshield secret scan path --recursive --yes --use-gitignore .`.
- Eredmeny: Letrejott a modularis Discord bridge skeleton config parserrel, Discord context key helperrel, AttysCodexBridge-kompatibilis worker klienssel es 18 zold Vitest teszttel. A build es typecheck sikeres; `ggshield` nem talalt secretet.
- Nyitott follow-up: Git repo inicializalas/remote osszekotes, Discord Gateway startup, guild-scoped slash command regisztracio, elso `/doctor` command.

## 2026-06-14 12:35 +02:00

- Cel: A helyi `Codex_Discord_BOT` mappa Git repova alakitasa es osszekotese a GitHub remote-tal.
- Modositott fajlok: `docs/STATE.md`, `docs/CHANGELOG.dev.md`.
- Futtatott parancsok: `git ls-remote https://github.com/Attys-syttA/Codex_Discord_BOT.git`; ideiglenes `git clone --depth 1` a remote tartalom ellenorzesere; `git init -b main`; `git remote add origin https://github.com/Attys-syttA/Codex_Discord_BOT.git`; `git fetch origin main`; `git switch -C main --track origin/main`; `git status --short --branch`; `git remote -v`.
- Eredmeny: A helyi mappa Git repo lett, `main` agon koveti az `origin/main` remote-ot. A remote-ban mar volt egy `LICENSE` commit, ez konfliktus nelkul bekerult; a skeleton fajlok tovabbra is commitolatlan, untracked allapotban vannak.
- Nyitott follow-up: Explicit jovahagyas utan initial skeleton stage/commit/push, majd Gateway/slash-command skeleton.

## 2026-06-14 12:45 +02:00

- Cel: Az initial TypeScript skeleton validalasa es publikaciohoz eloallitasa.
- Modositott fajlok: `docs/STATE.md`, `docs/CHANGELOG.dev.md`.
- Futtatott parancsok: `git status --short --branch`; `npm test`; `npm run typecheck`; `npm run build`; `ggshield secret scan path --recursive --yes --use-gitignore .`.
- Eredmeny: A skeleton tovabbra is zold: 18 Vitest teszt sikeres, typecheck es build sikeres, `ggshield` nem talalt secretet.
- Nyitott follow-up: Commit es push utan Gateway/slash-command skeleton.

## 2026-06-14 12:55 +02:00

- Cel: Gateway/slash-command skeleton es tesztelheto Discord command core hozzaadasa nagyobb kovetkezo szeletkent.
- Modositott fajlok: `.env.example`, `src/config.ts`, `src/index.ts`, `src/env.ts`, `src/session-registry.ts`, `src/command-definitions.ts`, `src/command-handlers.ts`, `src/discord-bot.ts`, `test/config.test.ts`, `test/env.test.ts`, `test/session-registry.test.ts`, `test/command-handlers.test.ts`, `docs/STATE.md`, `docs/CHANGELOG.dev.md`.
- Futtatott parancsok: `npm test`; `npm run typecheck`; `npm run build`; `ggshield secret scan path --recursive --yes --use-gitignore .`; `git status --short --branch`.
- Eredmeny: Letrejott a guild-scoped slash command definicio es a Discord Gateway client adapter. A parancsok egyelore config/session placeholder core-on futnak: `/doctor`, `/session`, `/workers`, `/new`, `/attach`, `/handoff`, `/abort`. A suite 27 zold tesztet futtat, a typecheck es build sikeres, `ggshield` nem talalt secretet.
- Nyitott follow-up: Localis `.env` feltoltese valodi tokennel, `DISCORD_REGISTER_COMMANDS=true` parancsregisztracio, majd privat Discord smoke; utana valos worker session wire.

## 2026-06-14 13:05 +02:00

- Cel: A command core osszekotese a valos AttysCodexBridge-kompatibilis worker API-val.
- Modositott fajlok: `src/command-handlers.ts`, `test/command-handlers.test.ts`, `docs/STATE.md`, `docs/CHANGELOG.dev.md`.
- Futtatott parancsok: `npm test`; `npm run typecheck`; `npm run build`; `ggshield secret scan path --recursive --yes --use-gitignore .`; `git status --short --branch`.
- Eredmeny: A `/new` mar worker sessiont hoz letre es uj Codex threadet indit; az `/attach` worker sessionon keresztul resume-olja a megadott threadet; a `/session` ismert worker sessionnel elo infot frissit; az `/abort` a worker abort endpointot hivja. A suite 29 zold tesztet futtat, typecheck/build sikeres, `ggshield` nem talalt secretet.
- Nyitott follow-up: Valodi `.env` + guild command registration + privat Discord smoke, majd prompt submission es streamed Discord valaszok.
