# LCARS47
The official Planetary Dynamics Discord Bot

--

[![Pldyn Official Repo](https://img.shields.io/badge/PlDyn-Official%20Repo-2d6ded)](https://pldyn.net)
[![Node.js CI](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/dev-test.yml/badge.svg)](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/dev-test.yml)
[![semantic-release: ESLint](https://img.shields.io/badge/semantic--release-eslint-341bab?logo=semantic-release)](https://github.com/semantic-release/semantic-release)
![GitHub top language](https://img.shields.io/github/languages/top/skyerangerdelta/LCARS47)

Developed and Maintained by: SkyeRangerDelta

For use only in the Planetary Dynamics(PlDyn) Discord server by PlDyn members for their use.

## Features
- Music player capabilities
    - Search/direct link
    - Queue
    - Skip
    - Stop
- System status / API
- James Webb Space Telescope (JWST)
- Jellyfin API (WIP)
- Discord Role Controls

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
