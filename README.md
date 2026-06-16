# Codex_Discord_BOT

`Codex_Discord_BOT` egy kulon Discord pilot projekt a Codex tavoli vezerlesere.

A cel nem a meglevo Telegram bridge atirasa, hanem egy tisztabb Discord-alapu vezerlofelulet kiprobalasa. A modell roviden:

- Discord server: a Codex vezerlofelulet
- Discord forum/channel: egy fix repo vagy workspace
- Discord thread: egy Codex session vagy atadasi szal
- NAS bridge: a mindig futo kozvetito
- worker PC: az a gep, ahol a Codex, Git es a fajlrendszer tenylegesen dolgozik

## Mostani mukodesi szint

A pilot mar nem csak slash parancsos vaz:

- SQLite-alapu allapottar kezeli a channel bindingot, sessiont, queue-t es approval allapotot
- a slash parancsok mellett a regisztralt projektcsatornaban vagy threadben kuldott normal Discord uzenet is lehet prompt
- kontextusonkent egyszerre egy aktiv futas lehet, a tobbi prompt sorba all
- az elso SQLite indulas at tudja emelni a korabbi `sessions.json` session adatokat

Fo parancsok:

- `/register-workspace`, `/unregister-workspace`
- `/status`, `/session`, `/sessions`, `/last`, `/doctor`
- `/session-new`, `/session-resume`, `/session-stop`
- `/queue list`, `/queue clear`
- `/worker-bind`, `/workers`
- `/git-status`, `/run-tests`, `/handoff`, `/ask`

A regi `/new`, `/attach`, `/abort` megmaradt atmeneti aliasnak.

## Biztonsag

- Token, worker secret es valodi `.env` fajl nem kerulhet Gitbe.
- A NAS bridge ne kapjon Codex authot, GitHub authot vagy kozvetlen repo-irasi jogot.
- A worker oldali titkok menjenek env-bol. A JSON config csak a hivatkozo env-nevet hordozza, peldaul `sharedSecretEnv`.

## Ellenorzes

Helyi fejlesztesnel a fo ellenorzes:

```powershell
npm run check:workspace
```

Ez lefuttatja a typecheck, teszt, build, NAS bundle, whitespace es secret scan ellenorzeseket. Ha Docker elerheto, a NAS image buildet is megprobalja.

NAS feltoltes elott mindig keszits friss deploy bundle-t:

```powershell
npm run nas:bundle:prepare
```

A bundle mar manifest-alapu. Ha uj top-level runtime fajl vagy mappa kell a NAS-os futashoz, azt elobb vedd fel a `discord_nas_bridge/bundle-manifest.json` fajlba.
Mostantol ezt egy kulon, verziokezelt NAS inventory is orzi:

- `nas-bundle.manifest.json`: mit hasznalhat a generator forrasnak
- `nas-runtime-inventory.json`: minden relevans repo-fajl besorolasa
- `npm run nas:inventory:write`: inventory frissitese uj/atnevezett/mozgatott fajlok utan
- `npm run nas:inventory:check`: ellenorzi, maradt-e besorolatlan fajl
- `npm run nas:bundle:check`: dry-run bundle ellenorzes
- `npm run nas:bundle:prepare`: a tenyleges `discord_nas_bridge/app/` generalasa

Ez ugyanazt a fegyelmet koveti, mint amit az `AttysCodexBridge_NAS` es az `email_header_analyzer` csomagolasa is hasznal: uj fajl nem maradhat csendben "kimarado" allapotban.

## Workspace utvonalak

Frissitett gyakorlat:

- minden worker kaphat sajat `workspaceRoot` erteket
- a `DISCORD_CHANNEL_MAPPINGS_JSON` `workspace` mezoje lehet csak repo-nev, peldaul `"Codex_Discord_BOT"`
- a worker `sharedSecret` kulon env-valtozobol is johet `sharedSecretEnv` mezon at
- auto forum mappingnel a bridge a kivalasztott worker `workspaceRoot` ertekebol epiti fel a vegso workspace utat
- a bot indulaskor a `CODEX_DISCORD_ENV_FILE` altal megadott env fajlt tolti be; ha ez nincs megadva, eloszor a `.env`, utana a `.env.nas` fajlt keresi
- az uj SQLite allapottar helyet a `DISCORD_DATABASE_PATH` adja meg
- a normal uzenetes promptokat a `DISCORD_ENABLE_MESSAGE_PROMPTS` valtozo kapcsolja
- a kontextusonkenti sor hosszat a `DISCORD_QUEUE_MAX_ITEMS` szabalyozza

Ez kezeli azt is, hogy ugyanaz a repo kulonbozo worker gepeken mas-mas workspace gyoker alatt lehet.

Helyi, workeres futtatasnal a `.env` minta maradhat egyszeru:

- a channel mapping `workspace` mezoje lehet `"Codex_Discord_BOT"`
- a worker `workspaceRoot` lehet `..`

Igy nem kell a mintafajlban meghajtobetuket cserelgetni. NAS-os bridge eseten tovabbra is erdemes explicit worker-oldali gyokerutat megadni, mert a kontener nem a worker PC fajlrendszeren fut.
