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

   Ha új Discord fórumokat szeretnél automatikusan repohoz kötni, állítsd be a worker gép workspace rootját:

   ```env
   DISCORD_AUTO_WORKSPACE_ROOT=E:\codex_works
   ```

   Ilyenkor egy nem kézzel mapelt fórum neve lesz a repo/projekt mappanév. Például a `codex_discord_bot` fórum a worker felé `<CODEX_WORKS_HOME>\codex_discord_bot` workspace-ként menne tovább. A kézi `DISCORD_CHANNEL_MAPPINGS_JSON` bejegyzések mindig elsőbbséget élveznek.

   Ha a Discord fórum neve kisbetűs slug, de a worker gépen a repo mappaneve más kis/nagybetűzést használ, adj meg alias táblát:

   ```env
   DISCORD_AUTO_WORKSPACE_ALIASES_JSON={"codex_discord_bot":"Codex_Discord_BOT"}
   ```

   Ezzel a `codex_discord_bot` fórum már `<CODEX_WORKS_HOME>\Codex_Discord_BOT` workspace-re mutat. Ez szándékosan statikus konfiguráció, mert a NAS konténer nem látja közvetlenül a worker PC `E:\codex_works` fájlrendszerét.

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
