<div align="center">

![LCARS47 — Planetary Dynamics Discord Bot](Assets/lcars-banner.svg)

**The official Planetary Dynamics Discord Bot**

![Version](https://img.shields.io/github/package-json/v/SkyeRangerDelta/LCARS47?style=for-the-badge&label=VERSION&labelColor=000000&color=FF9966)
![Status](https://img.shields.io/badge/STATUS-ONLINE-9999FF?style=for-the-badge&labelColor=000000)
![License](https://img.shields.io/badge/LICENSE-SOURCE_AVAILABLE-CC99CC?style=for-the-badge&labelColor=000000)
![Unit](https://img.shields.io/badge/UNIT-47-FFCC66?style=for-the-badge&labelColor=000000)

[![Pldyn Official Repo](https://img.shields.io/badge/PlDyn-Official%20Repo-2d6ded)](https://pldyn.net)
[![Node.js CI](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/test.yml/badge.svg)](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/dev-test.yml)
[![Build & Deploy](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/release-and-deploy.yml/badge.svg)](https://github.com/SkyeRangerDelta/LCARS47/actions/workflows/release-and-deploy.yml)
[![semantic-release: ESLint](https://img.shields.io/badge/semantic--release-eslint-341bab?logo=semantic-release)](https://github.com/semantic-release/semantic-release)
![GitHub top language](https://img.shields.io/github/languages/top/skyerangerdelta/LCARS47)

</div>

Developed and Maintained by: SkyeRangerDelta

Developed for use in the Planetary Dynamics (PlDyn) Discord server by PlDyn members for their use.

---

> `LCARS47 ONLINE.` Library Computer Access/Retrieval System standing by.

**LCARS47** is the resident ship's computer for the Planetary Dynamics Discord — purpose built Star Trek themed Omnissiah worshipping 
computer for PlDyn.

---

![AUDIO OPERATIONS](https://img.shields.io/badge/AUDIO_OPERATIONS-FF9966?style=for-the-badge&labelColor=FF9966)

A full voice-channel music system. It streams from a private Jellyfin library first and the
open web second, handling search, queueing, whole albums and playlists, an interactive song
selector, now-playing readouts with cover art, and on-demand lyrics.

![COMPUTER AI](https://img.shields.io/badge/COMPUTER_AI-CC99CC?style=for-the-badge&labelColor=CC99CC)

An in-character ship's computer powered by Claude. It converses through several distinct
personas, reasons over attached images and documents, can think harder when asked, and reaches
into the bot's own systems so its answers reflect what's actually happening aboard.

![OPERATIONS](https://img.shields.io/badge/OPERATIONS-9999FF?style=for-the-badge&labelColor=9999FF)

Real-time health and status for the crew's infrastructure — load, memory, storage, and uptime
across monitored hosts — alongside the bot's own vitals and a properly computed stardate. It
also keeps watch between requests, announcing to the bridge the moment a host drops off the
network or comes back, with enough restraint that a flapping link doesn't become an alert
storm.

![HOLODECK CONTROL](https://img.shields.io/badge/HOLODECK_CONTROL-66CC99?style=for-the-badge&labelColor=66CC99)

Game server control through the Impulse Controller's management panel. List every instance,
read live statistics off any one of them, and bring instances and the game servers inside
them up or down without leaving Discord — the two are controlled separately, exactly as the
panel treats them, and the bot follows a starting server until it actually comes up rather
than assuming it did. See [the technical notes](docs/technical/amp-api-integration.md).

![STELLAR CARTOGRAPHY](https://img.shields.io/badge/STELLAR_CARTOGRAPHY-FFCC66?style=for-the-badge&labelColor=FFCC66)

Imagery pulled straight from the James Webb Space Telescope archive — nebulae, galaxy
clusters, and exoplanet observations on request. Astrometrics reports sensor data against
wherever the ship actually is: real stars from the SIMBAD catalogue with their range and
bearing, canon Star Trek identities from STAPI, and procedurally generated sector readings
everywhere the real catalogues cannot reach. Ask it where Vulcan is and it resolves through
40 Eridani to a genuine fix, 16.3 light years out. See
[the feature notes](docs/features/astrometrics.md).

![NAVIGATION](https://img.shields.io/badge/NAVIGATION-FF9900?style=for-the-badge&labelColor=FF9900)

The ship has a real position. Coordinates are light years in a galactic-centre frame, mapped
onto the canon quadrant, sector block and sector hierarchy — she starts in orbit of Earth,
Sector 001. Lay in a course by bearing, mark and distance — or just name where you want to go —
and she gets under way at the
Galaxy class's normal cruising speed of warp 6, arriving after the time the journey actually
takes; high warp needs an officer, and she can be sped up or slowed down en route. Position
mid-voyage is derived from the departure clock rather than ticked, so it survives restarts
exactly. See
[the feature notes](docs/features/ship-navigation.md).

![CREW SERVICES](https://img.shields.io/badge/CREW_SERVICES-CC6666?style=for-the-badge&labelColor=CC6666)

Self-serve role management plus a Ferengi Dabo wheel for wagering Gold-Pressed Latinum —
balances, streaks, and leaderboards included.

![LAN INTERFACE](https://img.shields.io/badge/LAN_INTERFACE-99CCFF?style=for-the-badge&labelColor=99CCFF)

A LAN-only HTTP API for telemetry and outbound messaging, with a Swagger UI explorer at
`/api/docs` and an OpenAPI 3.1 document at `/api/openapi.json` — both assembled from the
routes themselves at boot. See [the technical notes](docs/technical/api-swagger.md).

---

**Source-available.** Read it, study it, reference it, and open issues or pull requests —
you're welcome to. LCARS47 is built specifically for the Planetary Dynamics server and isn't
packaged for general use; if you work out what it takes to self-host, you're free to try, but
no setup help or support will be provided. © SkyeRangerDelta.
