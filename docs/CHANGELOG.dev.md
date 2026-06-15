# CHANGELOG.dev.md

Append-only development log for `Codex_Discord_BOT`.

## 2026-06-15 09:10 +02:00

- Cel: A kovetett fajlokbol kivenni a publikus repoba nem valo privat azonosito-maradvanyokat ugy, hogy a bot mukodese ne seruljon.
- Modositott fajlok: `README.md`, `discord_nas_bridge/README.hu.md`, `docs/STATE.md`, `docs/CHANGELOG.dev.md`, `docs/codex-tasks/plans/pending/typescript_skeleton_terv.md`, `test/discord-context.test.ts`, `test/session-registry.test.ts`, `test/config.test.ts`, `test/command-handlers.test.ts`.
- Futtatott parancsok: celzott `rg` keresek a privat azonosito-maradvanyokra; utana ujraellenorzes es validacio kovetkezik.
- Eredmeny: A dokumentacioban, tervfajlban es tesztekben a konkret Discord ID-k, szemelyhez kotheto nevek, regi IP-peldak es valos hasznalatot idezo mintak helyett szintetikus ertekek maradnak. A runtime logika nem valtozik, csak a repo lesz tisztabb a nyilvanos megnyitashoz. Az utolso ellenorzesek is zoldre futottak: `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`, `ggshield secret scan repo .`.
- Nyitott follow-up: teljes validacio ujrafuttatasa, majd kulon korben a Git tortenet tisztitasa.

## 2026-06-15 09:26 +02:00

- Cel: A korabbi privat azonosito-maradvanyok kiszedese a Git tortenetbol is, nem csak a jelenlegi munkafabol.
- Modositott fajlok: atirt Git tortenet; helyi biztonsagi mentesek `D:\codex_works\_history_cleanup_backup\` alatt; a jelenlegi munkafa fajljai a korabbi tisztitott allapotban maradtak.
- Futtatott parancsok: `python -m pip install --user git-filter-repo`; `git stash push --include-untracked`; `python -m git_filter_repo --force --replace-text ... --replace-message ...`; `git remote add origin https://github.com/Attys-syttA/Codex_Discord_BOT.git`; `git stash pop`; `npm test`; `npm run typecheck`; `npm run build`; `git diff --check`; `ggshield secret scan repo .`; celzott `git log -G` es `rg` ujraellenorzesek.
- Eredmeny: A repotortenet lokalisan at lett irva. A korabbi konkret Discord ID-k, operatori nev, botnev, privat LAN IP-peldak es nehany gephez kotott utvonalmaradvany mar nem erheto el a tisztitott tortenetbol. A runtime ellenorzesek a rewrite utan is zoldre futottak.
- Nyitott follow-up: a mostani tiszta munkafa commitolasa, majd a rewrite miatt kotelezo `git push --force-with-lease` a tavoli `main`agra.

## 2026-06-15 08:28 +02:00

- Cel: A futasi konfiguracio teljesen env-alapu legyen, es a mintafajlok ne tartalmazzanak a jelenlegi hasznalatbol szarmazo valos azonositokat.
- Modositott fajlok: `.env.example`, `README.md`, `discord_nas_bridge/.env.nas.example`, `discord_nas_bridge/README.hu.md`, `src/env.ts`, `src/index.ts`, `test/env.test.ts`, `docs/STATE.md`, `docs/CHANGELOG.dev.md`.
- Futtatott parancsok: `npm test -- env config command-handlers`; `npm run typecheck`; `npm run build`; `ggshield secret scan path --recursive --yes --use-gitignore src/index.ts src/env.ts test/env.test.ts .env.example discord_nas_bridge/.env.nas.example README.md discord_nas_bridge/README.hu.md`.
- Eredmeny: A bot most mar tud a `CODEX_DISCORD_ENV_FILE` altal kijelolt env fajlbol indulni; ha ez nincs megadva, akkor `.env`, majd `.env.nas` sorrendben probalkozik. A ket mintafajl szintetikus Discord snowflake-okat, placeholder worker hostokat es fake secret ertekeket tartalmaz.
- Nyitott follow-up: a torteneti docs es Git tortenet kulon scrub/history-cleanup kort igenyel.

## 2026-06-15 08:20 +02:00

- Cel: A NAS-os bridge workerenkenti workspace gyokerrel tudja kezelni a kulonbozo gepeken levo `codex_works` kornyezeteket.
- Modositott fajlok: `.env.example`, `README.md`, `discord_nas_bridge/.env.nas.example`, `discord_nas_bridge/README.hu.md`, `src/config.ts`, `src/command-handlers.ts`, `test/config.test.ts`, `test/command-handlers.test.ts`, `docs/STATE.md`, `docs/CHANGELOG.dev.md`.
- Futtatott parancsok: `npm test -- config command-handlers`; `npm run typecheck`; `npm run build`.
- Eredmeny: A worker konfiguracio most mar tartalmazhat sajat `workspaceRoot` mezot. A kezi channel mapping `workspace` erteke lehet csak repo-nev vagy worker-roothoz kepesti relativ utvonal, az auto forum mapping pedig a kivalasztott default worker rootjabol epiti fel a vegso workspace utat.
- Nyitott follow-up: a valos NAS env frissitese, majd uj bundle feltoltes es smoke.

## 2026-06-14

- Fo eredmenyek:
  - letrejott a TypeScript-alapu Discord bridge skeleton
  - meglett a config parser, a Discord context kezeles es a worker kliens
  - bekerult a slash command keszlet es a session registry
  - elkeszult a NAS Docker scaffold es a deploy bundle folyamat
  - a workspace ellenorzes es a secret scan workflow is kialakult
- Megjegyzes: A korabbi naplo tul sok konkret privat uzemeltetesi adatot tartalmazott, ezert publikus repo elott szandekosan altalanositva lett.
