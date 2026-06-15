# Discord NAS bridge futtatas

Ez a mappa a NAS-on futtatando Discord bridge csomag helye.

## Szerep

- A NAS kontener tartja eletben a Discord botot.
- A worker PC vegzi a Codex, Git es filesystem muveleteket.
- A NAS bridge nem tartalmazhat Codex authot, GitHub authot vagy repo-irasi jogosultsagot.

## Fajlok

- `Dockerfile`: tobbfazisu Node.js 20 build es production runtime
- `docker-compose.yml`: NAS futtatas `restart: unless-stopped` moddal
- `.env.nas.example`: minta konfiguracio fake ertekekkel
- `.dockerignore`: kizarja a valodi `.env.nas` fajlt a Docker build contextbol
- `app/`: generalt build bundle, amelyet feltoltes elott a `scripts/prepare-nas-bundle.ps1` keszit el
- `data/`: helyi runtime allapot, peldaul `sessions.json`

## Elso inditas NAS-on

1. A Windows gepen, a repo gyokerebol keszits friss NAS bundle-t:

```powershell
.\scripts\prepare-nas-bundle.ps1
```

2. Toltsd fel a teljes `discord_nas_bridge` mappat a NAS megosztott mappajaba. Fontos, hogy az `app/` almappa is felkeruljon.
3. A NAS-on, a feltoltott mappaban keszits sajat env fajlt:

```sh
cp .env.nas.example .env.nas
```

4. Toltsd ki a valodi ertekeket a `.env.nas` fajlban.
5. A worker URL a NAS nezopontjabol legyen elerheto, peldaul:

```env
DISCORD_WORKERS_JSON=[{"id":"worker-home","label":"Otthoni worker","baseUrl":"http://worker-home.lan:8787","sharedSecretEnv":"DISCORD_WORKER_SHARED_SECRET_HOME","workspaceRoot":"E:\\workspace-home"}]
```

6. Ha uj Discord forumokat szeretnel automatikusan repohoz kotni, add meg az alias tablazatot:

```env
DISCORD_AUTO_WORKSPACE_ALIASES_JSON={"codex_discord_bot":"Codex_Discord_BOT"}
```

Ilyenkor a nem kezzel mapelt forum nevebol dolgozik a bridge, de a worker sajat `workspaceRoot` gyokeret hasznalja. A kezi `DISCORD_CHANNEL_MAPPINGS_JSON` bejegyzesek mindig elsoseget elveznek.

7. Inditas a NAS-on, a feltoltott mappabol:

```sh
docker compose up -d --build
```

8. Log ellenorzes:

```sh
docker compose logs -f codex-discord-bridge
```

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
- Az `app/` generalt deploy bundle. Ha kodot modositasz, futtasd ujra a `scripts/prepare-nas-bundle.ps1` scriptet es toltsd fel ujra a mappat.
- A kontener csak a Discord bridge-et inditja ujra. A worker PC ujrainditasa kulon, kesobbre tervezendo feladat.
- A `docker compose config` valos `.env.nas` mellett kiirhat tokeneket es shared secretet, ezert csak fake/example env-vel hasznald.
