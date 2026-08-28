# Ship Navigation

**Issues:** [#79](https://github.com/SkyeRangerDelta/LCARS47/issues/79) (move the ship)

LCARS47 role-plays the PlDyn server as a starship. Until now nothing in the bot knew *where*
that ship was, which left every sensor-flavoured feature with nothing to report against. This
subsystem gives her a real, persistent position, and a way to change it.

---

## The coordinate system

The **Galactic Standard Reference Frame (GSRF)**, defined in
`Src/Subsystems/Ship/Ship_Navigation.ts`:

| | |
|---|---|
| Origin | The galactic centre |
| Units | Light years |
| XY plane | The galactic plane |
| +Z | Galactic north |
| +X | Galactic centre → Sol |
| Handedness | Right-handed (`X × Y = Z`) |

Sol sits at `(30000, 0, 0)` — *Star Trek: Star Charts* puts it roughly 30,000 ly from the
core. Because canon runs one of the two quadrant dividing planes straight through Sol, the
+X half-axis **is** the Alpha/Beta boundary, which makes the quadrant test a pure sign check:

```
x ≥ 0, y ≥ 0  →  Alpha       x ≥ 0, y < 0  →  Beta
x < 0, y ≥ 0  →  Gamma       x < 0, y < 0  →  Delta
```

That reproduces the canon adjacency graph exactly: Alpha borders Beta and Gamma, Delta
borders Beta and Gamma, and neither Alpha/Delta nor Beta/Gamma are adjacent.

> **One documented convention.** Which of Alpha/Beta takes `y ≥ 0` is ours, not canon's —
> canon fixes the adjacencies but not the chirality of the naming relative to galactic north.
> It lives behind `ALPHA_TAKES_POSITIVE_Y`; flipping that swaps Alpha↔Beta and Gamma↔Delta
> and leaves every adjacency intact.

### Sectors

Canon gives a three-level hierarchy that turns out to be arithmetically self-consistent:

- A **sector** is a 20 × 20 × 20 ly cube.
- A **sector block** holds 100 sectors numbered 00–99, so it runs 5 × 5 × 4 sectors —
  100 × 100 × 80 ly.
- A **designation** is `block × 100 + index`.

That single rule explains every canon designation pattern: `Sector 001` is block 0 sector 01,
`Sector 2520` is block 25 sector 20, `Sector 21503` is block 215 sector 03.

The sector grid is anchored so Sol lands exactly on a grid corner and its cell resolves to
**Sector 001** — matching *Star Charts*, which notes Sol sits on the corner shared by eight
sectors and is assigned to 001 by navigational convention.

Block numbers come from a zig-zag encoding of the signed block index triple
(`0, -1, 1, -2, 2 → 0, 1, 2, 3, 4`) packed base-32. Blocks near Sol get the short three-digit
designations canon uses; remote ones get longer numbers, which is also lore-consistent. Canon
sector numbering is chronological by discovery and therefore not reproducible from geometry
by anyone — this is a deterministic projection, and named canon sectors will be resolved by
lookup rather than arithmetic.

### Bearings

Courses use canon `azimuth mark elevation` notation, both angles 0–359.9°. The frame is
**absolute**, not relative to the ship's attitude — the bot has no reason to track which way
the saucer points, and "000 mark 0 takes you to the core" is a far more usable contract:

| Course | Heading |
|---|---|
| `000 mark 0` | Straight at the galactic core |
| `180 mark 0` | Straight for the rim |
| `090 mark 0` | Spinward, in the galactic plane |
| `--- mark 90` | Galactic north, whatever the azimuth |
| `--- mark 270` | Galactic south |

At the galactic centre "coreward" is undefined, so the frame falls back to +X rather than
collapsing into NaNs.

---

## Velocity

TNG scale: `v = w^(10/3) · c` up to warp 9, then log-log interpolation across the Technical
Manual's published points (9.2 → 1649c, 9.6 → 1909c, 9.9 → 3053c, 9.99 → 7912c). The first
anchor uses `9^(10/3)` = 1519c rather than the printed 1516c so the piecewise function is
exactly continuous at warp 9; the 0.2% disagreement is the manual's.

**Time is real and uncompressed.** One real day is one ship day. At the default warp 6 a
20 ly sector crossing takes about 18.6 real days.

### Warp tiers

Straight from the Technical Manual: *"These specifications required the Galaxy class to
sustain a normal cruising speed of Warp 6 until fuel exhaustion, a maximum cruising speed of
Warp 9.2, and a maximum top speed of Warp 9.6 for twelve hours."*

| Warp | Who may order it | Behaviour |
|---|---|---|
| 1.0 – 6.0 | anyone | Normal cruise. No warnings. Warp 6 is the default. |
| 6.1 – 9.0 | anyone | Above normal cruise, still sustainable. Note about power draw. |
| 9.1 – 9.6 | **Officer only** | High warp. Structural stress warning. |
| above 9.6 | nobody | Beyond the Galaxy class's rated maximum. |

**The twelve-hour rule** is enforced when the course is ordered rather than by throttling in
flight: a course above warp 9.2 whose voyage would run longer than twelve hours is refused,
and the refusal quotes both the maximum run at that velocity (~2.6 ly at warp 9.6) and the
ETA at warp 9.2 instead. This makes high warp a short-hop tool and needs no runtime machinery.

### Changing speed mid-voyage

`/move speed` changes how fast the ship covers the course already laid in. The heading is
untouched — this is not a redirect.

It is gated by **the same warp tiers as ordering a course**, deliberately: without that,
ordering warp 6 and then bumping to 9.5 would be a free way around the officer check. The
twelve-hour rule is measured against the distance **still to run**, since the clock on high
warp restarts at the change.

Reducing speed is never blocked, because the gate is on the *target* velocity — a non-officer
can always slow the ship down from an officer-ordered high warp, which is the right way round
for a safety action.

**Mechanically, a speed change is not a mutation — it is a fresh leg.** The ship's interpolated
position becomes the new leg's origin, the destination is untouched, and the clock restarts.
The plan is still "two points and two timestamps", so nothing about restart safety or drift
changes. Two extra fields, `voyageOrigin` and `voyageDepartedAt`, remember where and when the
voyage actually began, so progress is reported across the whole run rather than resetting to
zero at every change — the progress bar must not visibly jump at the moment of the change, and
there is a test pinning exactly that.

The bearing is *recomputed* rather than copied: the local navigation frame rotates as the ship
moves around the core, so the same physical heading reads as a slightly different azimuth from
the new position.

### The Officer check

`hasBridgeAuthority` in `Src/Subsystems/Utilities/AuthUtils.ts` tests membership of the
Discord role literally named **Officer**, matched by name and case-insensitively. Admins
always pass, which is the recovery path when roles are mid-reshuffle.

If the guild has no role by that name the check **fails closed** to admins only — a gate that
silently opens because its role was renamed is worse than no gate. Note that this is plain
membership: a rank above Officer that does not *also* carry the Officer role would be refused.

---

## Persistence, and the one idea everything rests on

**Position in transit is derived, never ticked.**

A voyage stores an origin, a destination and two timestamps. Nothing ever writes an
intermediate position; every read interpolates from the clock. That means:

- no drift to reconcile,
- no catch-up logic after downtime,
- a restart mid-voyage is a non-event — she carries on from exactly where the clock says,
- `/move status`, the API and the AI context can never disagree with each other.

`ShipMonitor` (`Src/Subsystems/Monitors/ShipMonitor.ts`) exists only to announce arrivals and
tidy the document afterwards. If it never ran, every reader would still report the right
answer. It settles the ship *before* announcing, and that write is what guarantees a voyage is
announced exactly once — however many sweeps run, and however many times the bot restarts.

The resolver also reports a voyage past its ETA as `idle` rather than `transit`, so a new
course can be ordered the instant the ship arrives rather than waiting on the next sweep.

### Storage

Mongo collection `ship_position`, a singleton keyed `{ id: 1 }` — the same convention as
`rds_status`. Seeded on first read with the ship in orbit of Earth, Sector 001.

```ts
{
  id: 1,
  status: 'docked' | 'orbit' | 'idle' | 'transit',
  position: { x, y, z },          // GSRF, ly. Authoritative unless in transit.
  transit?: {                     // present only while under way
    origin,                       // start of the CURRENT leg
    voyageOrigin?,                // where the voyage began, if speed was changed
    destination,
    destinationName?,             // set when laid in against a named point
    bearing, mark, distanceLy,    // distanceLy is the current leg
    warpFactor,
    departedAt,                   // start of the CURRENT leg
    voyageDepartedAt?,            // when the voyage began
    etaAt, orderedBy
  },
  anchorage?: string,             // 'Earth' etc., for docked/orbit
  updatedAt, updatedBy
}
```

---

## Commands

### `/move status`

Open to everyone. Position, sector designation, quadrant, distance from the core and from
Sol, elevation relative to the galactic plane. Under way it adds a progress bar, distance run
and remaining, and the arrival time as both a relative and an absolute Discord timestamp.

### `/move course bearing mark distance [warp]`

Open to everyone up to warp 9.0. `warp` is optional and defaults to 6.

**No course may be ordered while the ship is already under way.** Redirects and emergency
course changes are deliberately deferred until there is a map to navigate against.

### `/move to destination [warp]`

Lay in a course for a point rather than a heading. The bearing, mark and distance are worked
out from where the ship currently is, and the destination is stored **exactly** rather than
re-projected from a rounded bearing — "set course for Sol" has to actually arrive at Sol.

`destination` accepts either:

- a **known point**, with autocomplete — currently `Sol` and `Galactic Centre`, both with
  aliases (`earth`, `terra`, `sector 001`, `core`, `sgr a*`, …);
- a **GSRF coordinate triple** in light years, tolerant of the shapes people actually type:
  `29980, 0, 0`, `29980 0 0`, `(29980, 0, 0)`, `[29980; 0; 0]`.

Named points are tried first, so a point of interest can never be shadowed by something that
happens to parse as three numbers. Anything else is refused with a message naming both formats.

`Src/Subsystems/Ship/Ship_Destinations.ts` is **the seam points of interest will land on.**
It exposes `resolveDestination`, `findCataloguePoint`, `parseCoordinates` and
`suggestDestinations`; when the canon location catalogue arrives it plugs in behind those, and
the command, its autocomplete and the planner all keep working unchanged. A named course
records `destinationName` on the transit plan, so every surface — status, departure, speed
change, arrival, the API — says where she is bound rather than just quoting a sector.

Note that ordering the galactic centre is ~30,000 ly and will be refused by the 5,000 ly course
cap. That is correct, and the refusal quotes the actual distance so it says something useful.

### `/move speed warp`

Only while under way — velocity means nothing on a stationary ship, and the refusal points at
`/move course` instead. Same tiers as ordering a course. The reply shows the old and new
arrival times side by side, and the time saved or added.

### `/move abort`

Admin only. Drops the ship out of warp at her interpolated position. This exists because with
real-time transit a routine warp-6 sector crossing otherwise locks the ship for ~19 real days
with no recovery path.

> Replies are public, refusals included. Whether an order is accepted is not known until after
> the deferral, so a refusal cannot be made ephemeral without making departures ephemeral too
> — and a refused order read out in channel is both in character and a free audit trail.

---

## Other surfaces

- **`GET /api/v1/ship`** — unauthenticated, LAN-only, documented in the OpenAPI spec under the
  `Navigation` tag. Resolves through the same interpolator, so repeated calls mid-voyage show
  the position advancing while origin and destination stay fixed. Once the speed has been
  changed the voyage has more than one leg: the unprefixed `TRANSIT` fields span the whole
  voyage, and `LEG_ORIGIN` / `LEG_DISTANCE_LY` / `LEG_DEPARTED_AT` describe the segment
  currently being flown. With no speed change they are identical. `DESTINATION_NAME` carries
  the name of a named target, or null for a bearing course.
- **`get_ship_position` AI tool** — lets `/computer` answer "where are we?" with real data.
- **AI operational context** — a one-line position summary rides in the second (uncached)
  system block, so the persona knows where the ship is without spending a tool call. It never
  goes in the persona block, which is `cache_control: ephemeral`.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `SHIP_LOG_CHANNEL` | no | Channel for arrival announcements. Falls back to `ENGINEERING`. |

## Source

| Path | Role |
|---|---|
| `Src/Subsystems/Ship/Ship_Navigation.ts` | Pure geometry, velocity and course rules |
| `Src/Subsystems/Ship/Ship_Utilities.ts` | Persistence and the position resolver |
| `Src/Subsystems/Ship/Ship_Destinations.ts` | Target resolution — the seam for points of interest |
| `Src/Subsystems/Ship/Ship_Messages.ts` | Flavour text and formatting |
| `Src/Subsystems/Monitors/ShipMonitor.ts` | Arrival announcements |
| `Src/Commands/Active/move.ts` | The slash command and its embeds |
| `Src/Subsystems/API/v1/ship.ts` | The REST endpoint |
| `Src/Subsystems/Auxiliary/Interfaces/ShipInterfaces.ts` | Shared types |

## Sources consulted

- *Star Trek: The Next Generation Technical Manual*, Sternbach & Okuda — warp velocity table,
  Galaxy class performance specifications, deflector generator notes.
- *Star Trek: Star Charts*, Geoffrey Mandel — Sol's distance from the core, Sol's placement on
  the Alpha/Beta boundary and in Sector 001.
- Memory Alpha — quadrant definitions, `mark` bearing notation, sector dimensions.
