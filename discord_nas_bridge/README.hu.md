# Discord NAS bridge futtatas

Ez a mappa a NAS-on futtatando Discord bridge csomag helye.

## Szerep

- A NAS kontener tartja eletben a Discord botot.
- A worker PC vegzi a Codex, Git es filesystem muveleteket.
- A NAS bridge nem tartalmazhat Codex authot, GitHub authot vagy repo-irasi jogosultsagot.

## Fajlok

- `Dockerfile`: tobbfazisu Node.js 20 build es production runtime
  - a jelenlegi image telepit Python + `make` + `g++` eszkozoket is, mert a `better-sqlite3` natív Node modult fordit a build soran
- `docker-compose.yml`: prebuilt NAS image-re alapozott futtatas `restart: unless-stopped` moddal
- `docker-compose.build.yml`: forrasbol epito alternativa, ha valaki kifejezetten helyben akar buildelni
- `.env.nas.example`: minta konfiguracio fake ertekekkel
- `.dockerignore`: kizarja a valodi `.env.nas` fajlt a Docker build contextbol
- `app/`: generalt build bundle, amelyet feltoltes elott a `scripts/prepare-nas-bundle.ps1` keszit el
- `app/`: generalt build bundle, amelyet feltoltes elott a NAS inventory + bundle check utan a `scripts/prepare-nas-bundle.ps1` keszit el
- `data/`: helyi runtime allapot, peldaul `sessions.json`

## Elso inditas NAS-on

DS223j-nel az ajanlott ut a prebuilt ARM64 image import. Ez lenyegesen jobb, mint a NAS-on forrasbol forditani a natív Node modulokat.

1. A Windows gepen, a repo gyokerebol keszits friss NAS bundle-t:

```powershell
.\scripts\prepare-nas-bundle.ps1

Javasolt ellenorzesi sorrend:

```powershell
npm run nas:inventory:check
npm run nas:bundle:check
npm run nas:bundle:prepare
```
```

2. Ugyanitt epits prebuilt ARM64 image-et a DS223j-hez:

```powershell
npm run nas:image:arm64:build
```

Ez letrehozza ezt a fajlt:

- `dist/nas-images/codex-discord-bridge-nas-arm64.tar`

3. Toltsd fel a teljes `discord_nas_bridge` mappat a NAS megosztott mappajaba. Fontos, hogy az `app/` almappa is felkeruljon.
4. Toltsd fel a `dist/nas-images/codex-discord-bridge-nas-arm64.tar` fajlt is a NAS-ra.
5. A NAS-on importald a kepet a `Kep` nezetben, vagy SSH-bol:

```sh
docker load -i codex-discord-bridge-nas-arm64.tar
```

6. A NAS-on, a feltoltott mappaban keszits sajat env fajlt:

```sh
cp .env.nas.example .env.nas
```

7. Toltsd ki a valodi ertekeket a `.env.nas` fajlban.
8. A worker URL a NAS nezopontjabol legyen elerheto, peldaul:

```env
DISCORD_WORKERS_JSON=[{"id":"worker-home","label":"Otthoni worker","baseUrl":"http://worker-home.lan:8787","sharedSecretEnv":"DISCORD_WORKER_SHARED_SECRET_HOME","workspaceRoot":"E:\\workspace-home"}]
```

9. Ha uj Discord forumokat szeretnel automatikusan repohoz kotni, add meg az alias tablazatot:

```env
DISCORD_AUTO_WORKSPACE_ALIASES_JSON={"codex_discord_bot":"Codex_Discord_BOT"}
```

Ilyenkor a nem kezzel mapelt forum nevebol dolgozik a bridge, de a worker sajat `workspaceRoot` gyokeret hasznalja. A kezi `DISCORD_CHANNEL_MAPPINGS_JSON` bejegyzesek mindig elsoseget elveznek.

10. Inditas a NAS-on, a feltoltott mappabol:

```sh
docker compose up -d
```

11. Log ellenorzes:

```sh
docker compose logs -f codex-discord-bridge
```

Ha a projekt nem hozza letre a vegso kontenert, csak egy ideiglenes build-kontener jelenik meg, akkor az elso gyanus pont a Docker build. Ebben a repo-ban a legfontosabb ilyen buildfugges a `better-sqlite3`, amihez a NAS image-ben Python es C/C++ build eszkozok kellenek. A DS223j eseteben emiatt kifejezetten a prebuilt image import az ajanlott fo ut.

## Forrasbol epito tartalek ut

Ha valamiert megis a NAS-on akarsz buildelni, a `docker-compose.build.yml` fajlt hasznald. Ez lassabb, es a DS223j hardveren jo esellyel gyengebb elmenyt ad, mint az elore gyartott ARM64 image import.

## Munkahely vs otthon worker

Javasolt felallas:

- minden worker kapjon sajat `workspaceRoot` erteket a `DISCORD_WORKERS_JSON` mezoben
- a worker titka kulon env valtozoba keruljon, a JSON csak ennek a nevet vigye `sharedSecretEnv` mezoben
- az `otthon` worker rootja lehet a helyi workspace gyoker
- a `munkahely` worker rootja lehet egy masik gep sajat workspace gyokere
- a `DISCORD_CHANNEL_MAPPINGS_JSON` `workspace` erteke eleg, ha csak a repo neve, peldaul `Codex_Discord_BOT`

Pelda:

```env
DISCORD_WORKERS_JSON=[{"id":"otthon","label":"Otthon worker","baseUrl":"http://worker-home.lan:8787","sharedSecretEnv":"DISCORD_WORKER_SHARED_SECRET_HOME","workspaceRoot":"E:\\workspace-home"},{"id":"munkahely","label":"Munkahely worker","baseUrl":"http://worker-office.lan:8787","sharedSecretEnv":"DISCORD_WORKER_SHARED_SECRET_OFFICE","workspaceRoot":"D:\\workspace-office"}]
DISCORD_CHANNEL_MAPPINGS_JSON=[{"channelId":"100000000000000101","workspace":"Codex_Discord_BOT","workerId":"otthon"}]
DISCORD_AUTO_WORKSPACE_ALIASES_JSON={"codex_discord_bot":"Codex_Discord_BOT"}
```

Igy a NAS-os bridge nem egyetlen fix utvonalat tarol, hanem a kivalasztott worker alapjan allitja elo a vegso workspace utat.

Az env betolteshez hasznalhatod a `CODEX_DISCORD_ENV_FILE` valtozot is:

- worker oldalon tipikusan `CODEX_DISCORD_ENV_FILE=.env`
- NAS oldalon tipikusan `CODEX_DISCORD_ENV_FILE=.env.nas`

Ha ez nincs megadva, a bot eloszor a `.env`, utana a `.env.nas` fajlt keresi.

## Fontos

- A `.env.nas` fajlt soha ne commitold.
- A `/data/sessions.json` runtime allapot, nem forraskod.
- Az `app/` generalt deploy bundle. Ha kodot modositasz, elobb ellenorizd a NAS inventory-t es a dry-run bundle-t, utana futtasd ujra a `scripts/prepare-nas-bundle.ps1` scriptet es toltsd fel ujra a mappat.
- A kontener csak a Discord bridge-et inditja ujra. A worker PC ujrainditasa kulon, kesobbre tervezendo feladat.
- A `docker compose config` valos `.env.nas` mellett kiirhat tokeneket es shared secretet, ezert csak fake/example env-vel hasznald.
