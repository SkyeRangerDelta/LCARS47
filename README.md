# LCARS47
The official Planetary Dynamics Discord Bot

--

[![Node.js CI](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/dev-test.yml/badge.svg)](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/dev-test.yml)
[![Super-Linter](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/super-linter.yml/badge.svg)](https://github.com/marketplace/actions/super-linter)

Developed and Maintained by: SkyeRangerDelta

For use only in the Planetary Dynamics(PlDyn) Discord server by PlDyn members for their use.

## Features
- Music player capabilities
    - Search/direct link
    - Queue
    - Skip
    - Stop
- System status

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

## NPM Packages
- discord.js@13.6.0
- @discordjs/builders@0.11.0
- @discordjs/opus@0.7.0
- @discordjs/rest@0.2.0-canary.0
- @discordjs/voice@0.7.5
- discord-api-types@0.26.1
- colors@1.4.0
- dotenv@14.3.2
- ffmpeg-static@4.4.1
- libsodium-wrappers@0.7.9
- mongodb@4.5.0
- npm@8.7.0
- ytdl-core@4.11.0
- ytsr@3.6.0
