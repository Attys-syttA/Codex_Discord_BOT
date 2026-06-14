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
- `data/`: helyi runtime állapot, például `sessions.json`.

## Első indítás NAS-on

1. Másold a repót vagy a NAS bundle-t a NAS-ra.
2. A `discord_nas_bridge` mappában készíts saját env fájlt:

   ```sh
   cp .env.nas.example .env.nas
   ```

3. Töltsd ki a valódi értékeket a `.env.nas` fájlban.
4. A worker URL a NAS nézőpontjából legyen elérhető, például:

   ```env
   DISCORD_WORKERS_JSON=[{"id":"otthon","label":"Otthon worker","baseUrl":"http://worker-home.example:8787","sharedSecret":"..."}]
   ```

5. Indítás:

   ```sh
   docker compose up -d --build
   ```

6. Log ellenőrzés:

   ```sh
   docker compose logs -f codex-discord-bridge
   ```

## Fontos

- A `.env.nas` fájlt soha ne commitold.
- A `/data/sessions.json` runtime állapot, nem forráskód.
- A konténer csak a Discord bridge-et indítja újra. A worker PC újraindítása külön, később megtervezendő feladat.
- A `docker compose config` valós `.env.nas` mellett kiírhatja a tokeneket és shared secre­teket, ezért csak fake/example env-vel használd.
