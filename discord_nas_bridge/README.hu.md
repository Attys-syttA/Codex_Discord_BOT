# Discord NAS bridge futtatás

Ez a mappa a NAS-on futtatandó Discord bridge csomag helye.

## Szerep

- A NAS konténer tartja életben a Discord botot.
- A worker PC végzi a Codex, Git és filesystem műveleteket.
- A NAS bridge nem tartalmazhat Codex authot, GitHub authot vagy repo írási jogosultságot.

## Fájlok

- `Dockerfile`: többfázisú Node.js 20 build és production runtime.
- `docker-compose.yml`: NAS futtatás `restart: unless-stopped` móddal.
- `.env.nas.example`: minta konfiguráció fake értékekkel.
- `.dockerignore`: kizárja a valódi `.env.nas` fájlt a Docker build contextből.
- `app/`: generált build bundle, amelyet feltöltés előtt a `scripts/prepare-nas-bundle.ps1` készít el.
- `data/`: helyi runtime állapot, például `sessions.json`.

## Első indítás NAS-on

1. A Windows gépen, a repo gyökeréből készíts friss NAS bundle-t:

   ```powershell
   .\scripts\prepare-nas-bundle.ps1
   ```

2. Töltsd fel a teljes `discord_nas_bridge` mappát a NAS megosztott mappájába. Fontos, hogy az `app/` almappa is felkerüljön.
3. A NAS-on, a feltöltött mappában készíts saját env fájlt:

   ```sh
   cp .env.nas.example .env.nas
   ```

4. Töltsd ki a valódi értékeket a `.env.nas` fájlban.
5. A worker URL a NAS nézőpontjából legyen elérhető, például:

   ```env
   DISCORD_WORKERS_JSON=[{"id":"otthon","label":"Otthon worker","baseUrl":"http://worker-home.example:8787","sharedSecret":"..."}]
   ```

6. Indítás a NAS-on, a feltöltött mappából:

   ```sh
   docker compose up -d --build
   ```

7. Log ellenőrzés:

   ```sh
   docker compose logs -f codex-discord-bridge
   ```

## Fontos

- A `.env.nas` fájlt soha ne commitold.
- A `/data/sessions.json` runtime állapot, nem forráskód.
- Az `app/` generált deploy bundle. Ha kódot módosítasz, futtasd újra a `scripts/prepare-nas-bundle.ps1` scriptet és töltsd fel újra a mappát.
- A konténer csak a Discord bridge-et indítja újra. A worker PC újraindítása külön, később megtervezendő feladat.
- A `docker compose config` valós `.env.nas` mellett kiírhatja a tokeneket és shared secre­teket, ezért csak fake/example env-vel használd.
