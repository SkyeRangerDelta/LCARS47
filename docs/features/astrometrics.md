# Astrometrics

**Issues:** [#78](https://github.com/SkyeRangerDelta/LCARS47/issues/78) (real-time astrometrics data)

Sensor data, reported against wherever the ship currently is. Builds directly on
[ship navigation](ship-navigation.md) — without a position there is nothing to report against.

---

## Three layers, in decreasing order of certainty

| Layer | Source | What it gives | Where it works |
|---|---|---|---|
| **Stellar catalogue** | SIMBAD TAP (CDS) | Real objects with **measured** positions, spectral types | Within 500 ly of Sol |
| **Canon database** | STAPI (stapi.co) | What a Star Trek object *is*, and what it sits inside | Anywhere, by name |
| **Procedural** | Local | Sector readings — density, radiation, subspace conditions | Everywhere |

Both remote services are public, read-only and need no credentials.

**The procedural layer is the floor.** Every remote lookup is allowed to fail, and when one
does the report says what is missing rather than failing. A sensor report that errors out
because a third party is down is worse than one that says long-range catalogue access is
unavailable.

The report is explicit about provenance and never blurs the line: catalogue positions are
measured, sector readings are generated, and the embed footer says so.

---

## Getting real stars into the ship's frame

Catalogues speak ICRS/J2000 — right ascension, declination, parallax. The ship speaks GSRF —
light years, origin at the galactic centre. `Astro_Coordinates.ts` is the bridge:

```
(ra, dec, distance)  <->  heliocentric equatorial Cartesian
                     <->  heliocentric galactic Cartesian
                     <->  GSRF
```

The rotation is the standard Hipparcos matrix (ESA SP-1200 §1.5.3). The last step follows from
how GSRF is defined: galactic +x points from Sol *in* at the centre while GSRF +X points back
*out* through Sol, so

```
gsrf = ( 30000 − h.x , −h.y , h.z )
```

which is its own inverse, so one function serves both directions.

This is checked against points whose answer is fixed by definition rather than by a catalogue —
the galactic centre maps to galactic +x, the north galactic pole to +z, a star at zero distance
lands on Sol — plus Sirius, whose published galactic coordinates put it below the plane and
outward of Sol. The published matrix is quoted to ten decimal places, so round-trips are exact
to about 5e-11; the tests say so rather than pretending to more.

### Range

A parallax is only a distance if it was measured well, which in practice means the solar
neighbourhood. Past **500 ly from Sol** the provider returns nothing and the report says
*"beyond charted space"* — reporting stars whose distances are noise would be worse than
reporting none.

### Querying by volume

The sweep is phrased in heliocentric equatorial Cartesian light years so the database does the
volume filtering rather than us pulling half the catalogue and discarding it:

```sql
WHERE plx_value > 0
  AND ABS(3.261563777*(1000/plx_value)*COS(RADIANS(dec))*COS(RADIANS(ra)) - cx) < r
  AND ...
```

A box, then an exact sphere test locally. Two quirks of this service, both discovered by
trying it: `NOT LIKE` is rejected on `otype`, so exoplanets — which SIMBAD returns at their
host star's coordinates — are filtered here instead; and multiple systems appear as the
composite *plus* each component at effectively the same point, so anything within 0.15 ly of an
already-kept entry is treated as the same object.

Sol is added by hand. It has no parallax to itself, so without that the one star everybody
knows would be the only one the sweep could not see.

---

## Scanning a named object

`/astrometrics scan` pairs the two remote sources. STAPI supplies canon identity; SIMBAD
supplies a real fix when the object is — or orbits — a real star.

Getting from one to the other needs two rewrites of what STAPI reports as the parent:

```
'Vulcan system'  ->  'Vulcan'        trailing designator
'40 Eridani A'   ->  '40 Eridani'    trailing component letter
```

The second matters: SIMBAD indexes the system as `40 Eridani` and has **no identifier**
`40 Eridani A` at all, so without it the lookup simply misses. With it:

```
/astrometrics scan Vulcan
  Canon record   Vulcan — M-class planet, within 40 Eridani A
  Catalogue fix  omi02 Eri, K0V
  Range          16.34 ly      Bearing  201 mark 322
```

16.3 ly is where 40 Eridani actually is, and where canon puts Vulcan.

Candidates are tried most-specific-first and capped at four lookups so a scan's latency stays
bounded. `fixCandidates` is pure and unit tested.

---

## Sector readings

Everything in `ProceduralProvider.ts` is a pure function of the sector, so a sector reads
identically however often it is scanned and a restart changes nothing. Readings that drifted
between scans would be obviously fake; readings that persisted would need storing.

They are invented, and the report labels them computed rather than measured. What makes them
defensible is that they vary the way real space does:

- **Stellar density** falls off exponentially with distance from the core (11,000 ly scale
  length), so sectors near Sol land near the canon figure of ~40 stars, the inner galaxy runs
  far denser, and the outer halo thins out.
- **Spectral class** is drawn against the real initial mass function — M dwarfs dominate, O
  stars are vanishingly rare. Without this every report would read like a list of blue giants.
- **Particle density, background radiation** scale with the same density factor.
- **Anomalies** appear in about a third of sectors.

The sector hash mixes each axis with its own multiplier before combining, so `(1,2,3)` and
`(3,2,1)` do not collide — a plain sum or xor would make a grid of identical sectors.

---

## Commands

### `/astrometrics report`

Position, sector, quadrant, distance from the core and from Sol, elevation relative to the
galactic plane; catalogued objects within 25 ly with range and bearing; and the sector readings.

### `/astrometrics scan <object>`

Identify an object and put a bearing and range on it where one can be had. The `object` option
autocompletes against STAPI live, with a two-second timeout — a slow third party must not be
what makes the option box hang.

Both are open to everyone: this reads, it never moves anything.

---

## Caching

`astro_cache` in Mongo, 24-hour TTL, checked on read rather than by a TTL index — it is one
comparison, needs no index management, and a stale row costs nothing until someone asks for it.

Worth having because of how the ship moves: she sits in one 20 ly sector for real weeks, so a
sector-keyed sweep is asked for repeatedly with the same answer. Mongo rather than memory so a
deploy does not throw the results away.

A cache miss, a stale row, a failed read, a failed write, or no database at all all lead to the
same place: run the work. The cache is an optimisation and is never allowed to be the reason a
report fails.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ASTROMETRICS_REMOTE` | `true` | Set to `false`/`0`/`no`/`off` to stop all outbound catalogue lookups. Reports then carry procedural readings only. |

> **Note on the default.** The approved plan called for a feature group that left this off until
> configured. Feature groups exist to gate credentials, and there are none here — both services
> are public and keyless — so gating on configuration would have meant the feature shipped
> looking half-built. It defaults on, and the variable exists to turn it off.

---

## Other surfaces

- **`get_astrometrics`** AI tool — a sensor sweep for `/computer`. Tells the model the readings
  are computed rather than measured, so it says so if asked.
- **`scan_object`** AI tool — "where is Vulcan?" answered with a real range and bearing.

---

## Verification

```
npm run lint && npx tsc && npm test && npx type-coverage
```

The remote providers are tested with `fetch` stubbed against **real captured responses** — the
live SIMBAD rows for a sweep centred on Sol, and the live five-record STAPI response for
"Vulcan". That exercises query construction, row parsing, coordinate conversion, planet
filtering, dedupe and ordering with no network.

End to end, with the bot running:

1. `/astrometrics report` from Earth orbit lists Proxima Centauri at 4.25 ly, α Centauri at
   4.34, Barnard's Star at 5.96, Wolf 359 at 7.86 — all matching published values.
2. `/astrometrics scan Vulcan` resolves through 40 Eridani to a fix at 16.34 ly.
3. `/astrometrics scan Bajor` returns canon identity with no fix, and says why.
4. `ASTROMETRICS_REMOTE=false` still produces a full report, procedural only.
5. A report from beyond 500 ly of Sol reports "beyond charted space" and makes no outbound call.

## Source

| Path | Role |
|---|---|
| `Src/Subsystems/Astrometrics/Astro_Coordinates.ts` | ICRS ↔ galactic ↔ GSRF conversion |
| `Src/Subsystems/Astrometrics/SimbadProvider.ts` | Real stellar positions |
| `Src/Subsystems/Astrometrics/StapiProvider.ts` | Canon Star Trek identity |
| `Src/Subsystems/Astrometrics/ProceduralProvider.ts` | Deterministic sector readings |
| `Src/Subsystems/Astrometrics/AstrometricsService.ts` | Merging and degradation |
| `Src/Subsystems/Astrometrics/Astro_Cache.ts` | Mongo TTL cache |
| `Src/Subsystems/Astrometrics/Astro_Config.ts` | Env access, kept out of the service |
| `Src/Commands/Active/astrometrics.ts` | The slash command and its embeds |

## External services

| Service | Endpoint | Auth | Notes |
|---|---|---|---|
| SIMBAD TAP | `simbad.cds.unistra.fr/simbad/sim-tap/sync` | none | ADQL. Operated by CDS, Strasbourg. |
| STAPI | `stapi.co/api/v1/rest/astronomicalObject/search` | none | 2404 canon objects, 190 sectors. No coordinates. |
