# LCARS47
The official Planetary Dynamics Discord Bot

--

[![Pldyn Official Repo](https://img.shields.io/badge/PlDyn-Official%20Repo-2d6ded)](https://pldyn.net)
[![Node.js CI](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/test.yml/badge.svg)](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/dev-test.yml)
[![Build & Deploy](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/release-and-deploy.yml/badge.svg)](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/release-and-deploy.yml)
[![semantic-release: ESLint](https://img.shields.io/badge/semantic--release-eslint-341bab?logo=semantic-release)](https://github.com/semantic-release/semantic-release)
![GitHub top language](https://img.shields.io/github/languages/top/skyerangerdelta/LCARS47)

Developed and Maintained by: SkyeRangerDelta

For use only in the Planetary Dynamics(PlDyn) Discord server by PlDyn members for their use.

## Features
- Music player capabilities
    - Search/direct link (`/play`)
    - Queue / Now Playing / Skip / Stop
    - Jellyfin library preferred over YouTube (`/play`, `/jellyfin-search`)
    - In-place yt-dlp binary refresh (`/ytdlp-update`)
- System status / API
- James Webb Space Telescope (JWST)
- Discord Role Controls

## Media Player

The player is provider-abstracted (`Src/Subsystems/MediaPlayer/`):

| Provider | Source | Notes |
|---|---|---|
| Jellyfin | `@jellyfin/sdk` catalog | Tried first when configured. Reads `Item.Path` and streams the file from the NAS directly; falls back to Jellyfin HTTP audio stream if the path isn't reachable. |
| YouTube  | `youtube-sr` + `ytdlp-nodejs` | Fallback when nothing matches in the library. The yt-dlp binary lives at `/usr/local/bin/yt-dlp` in the container and is refreshed in place by `/ytdlp-update`. |

### Required env for Jellyfin

```
JELLYFIN_HOST=jellyfin.example.lan
JELLYFIN_PORT=8096
JELLYFIN_USER=lcars
JELLYFIN_PASS=...
JELLYFIN_KEY=...           # optional API key (used as initial token)
JELLYFIN_PATH_MAP=/media/music=>/mnt/nas/music,/media/abk=>/mnt/nas/abk
```

`JELLYFIN_PATH_MAP` translates the **Jellyfin server's** view of a file path to the path that path appears at **inside the bot container**. If the bot can't see the file at the translated path it transparently falls back to Jellyfin's HTTP stream. Without the map (or without the NAS mounted in the container) every Jellyfin track plays via HTTP — still works, just transcoded by the Jellyfin server.

### Admin

`/ytdlp-update` refreshes the yt-dlp binary in place — use when YouTube playback starts failing with extraction errors. Restricted by Discord guild Administrator permission. Add `ADMIN_USER_IDS=<id1>,<id2>` for an additional allow-list.

## Mechanics
LCARS47 is a TypeScript application and runs under the Discord.JS API. The system structure primarily runs in the following order:
1. Initialize
   1. Register event logic
   2. Register individual command logic
   3. Register guild slash commands
2. Login
3. Listen for events
   1. Event handler -> command handler (no other events significantly processed)
      1. Command handler processes/does things
   2. RDS (Remote Data Store) transactions recorded per event
