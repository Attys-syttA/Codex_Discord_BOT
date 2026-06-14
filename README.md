# Codex_Discord_BOT

Codex_Discord_BOT egy külön Discord pilot projekt a Codex távoli vezérlésére.

A cél nem a meglévő Telegram bridge átírása, hanem egy tisztább Discord-alapú vezérlőfelület kipróbálása. A tervezett modell egyszerű:

- Discord server: a Codex vezérlőfelület
- Discord channel: egy fix repo vagy workspace
- Discord thread: egy Codex session vagy átadási szál
- NAS bridge: a mindig futó közvetítő
- worker PC: az a gép, ahol a Codex, Git és fájlrendszer ténylegesen dolgozik

## Miért Discord?

A Discord jobban illeszkedik a repo-alapú munkához, mert a csatornák és threadek natív szervezési eszközök. Egy `#email-header-analyzer` vagy `#attys-bridge` csatorna természetesen kötődhet egy projekthez, a csatornán belüli thread pedig egy konkrét fejlesztési szálhoz.

A Telegram bridge ettől nem válik feleslegessé. Az továbbra is stabil fallback és működő referencia marad.

## Első cél

Az első projektfázis dokumentációs és architekturális:

1. rögzíteni a projekt szabályait,
2. megtervezni a Discord platform MVP-t,
3. később külön lépésben felépíteni a TypeScript + `discord.js` alapú botot.

## Biztonsági alapelv

A Discord bot ne kapjon közvetlen repo- vagy credential-hozzáférést. A worker PC marad a bizalmi határ: ott él a Codex auth, GitHub auth, Git és a helyi fájlrendszer.

Tokenek, worker secret-ek és `.env` fájlok nem kerülhetnek Gitbe.
