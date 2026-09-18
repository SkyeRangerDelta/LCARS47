# User Statistics

**Issues:** [#81](https://github.com/SkyeRangerDelta/LCARS47/issues/81) (user stats),
[#63](https://github.com/SkyeRangerDelta/LCARS47/issues/63) (suggestions and enhancements)

LCARS47 already tracked what *it* did — uptime, query counts, command failures — in the
`rds_status` singleton. It tracked nothing about who was doing the asking. This subsystem adds
per-member activity counters and a `/profile` command to read them back.

Explicitly **not** an XP system. #81 opens with "I fear an XP system will likely be irritating
for a server so small", and that judgement drove the design: there are no levels, no ranks, no
rewards, and nothing that fires a message at anyone. Just counters you can go and look at.

---

## What gets counted

| Counter | Source event | Notes |
|---|---|---|
| `MESSAGES` | `messageCreate` | Guild messages only. Bots and DMs excluded. |
| `COMMANDS` | `interactionCreate` | Slash commands that ran to completion. |
| `COMMANDS_FAILED` | `interactionCreate` | Slash commands that threw. |
| `REACTIONS` | `messageReactionAdd` | Lifetime adds. Removals do **not** decrement. |

Alongside those, each record carries `username` (refreshed on every write), `firstSeen` and
`lastSeen`.

**Counters only — no content.** No message text, no channel ids, no per-event rows, no
timestamps beyond first and last activity. There is nothing in `user_stats` that could
reconstruct who said what or where.

### Three deliberate exclusions

**DMs don't count.** A direct message to the bot is not server participation, and counting it
would let anyone inflate their own numbers in private.

**Buttons and autocomplete don't count.** Only chat-input commands increment `COMMANDS`. "How
many slash interactions have I submitted" has an obvious answer and it isn't "every time you
clicked a Dabo button."

**Reaction removals don't decrement.** `REACTIONS` is a lifetime count of reactions added, not
a live tally of reactions currently standing. Decrementing would need `messageReactionRemove`
plus a floor at zero, and would still drift whenever a message gets deleted out from under it.
A monotonic counter is the honest version of this number.

---

## Storage

Collection `user_stats` in `LCARS47_DS`, keyed on the Discord user id, with a unique index
created idempotently at boot.

### Every write is a single upsert

`Src/Subsystems/Stats/Stats_Utilities.ts` has exactly one write path:

```js
updateOne(
  { id: userId },
  {
    $inc:         { [field]: amount },
    $set:         { username },
    $max:         { lastSeen },
    $setOnInsert: { id, firstSeen, ...otherCountersZeroed }
  },
  { upsert: true }
)
```

There is no "create the record" branch and no read-modify-write anywhere. The first time a
member does anything, the same call that increments their counter also seeds the document.

That matters for three reasons: no lost updates when two events land at once, no ordering
requirement between the message and command paths, and no membership backfill to run at boot.
The Fishsticks equivalent does select → insert → select on first contact; this does one round
trip, always.

> **Why `$max` and not `$set` for `lastSeen`.** These writes are fire-and-forget, so two events
> can reach Mongo in either order and an older one would otherwise drag the timestamp backwards.
> `$max` makes the field monotonic regardless of arrival order. `firstSeen` needs no such
> treatment — it is under `$setOnInsert`, and only one upsert can win the insert.

> **One sharp edge.** Mongo rejects an update touching the same field in both `$inc` and
> `$setOnInsert`, so `bumpUserStat` deletes the incremented field from the seed object before
> issuing the write. `$inc` on a missing field already yields the right value. There is a test
> pinning this — it's the difference between working and throwing at runtime.

### A stats write can never break what it's counting

`recordActivity()` wraps the upsert, swallows any rejection and logs a warning. Every call site
is on a hot path inside an event handler, where an unhandled rejection would take out message
handling or command dispatch. Callers don't await it and there's nothing to await for.

Index creation is deliberately *not* a startup prerequisite. Without the unique index, two
simultaneous first-events for one member could in principle both insert and split their
counters — but the cost of that is one person's message count being slightly wrong. Refusing to
boot the bot over it would trade a cosmetic inaccuracy for total unavailability.

It also no-ops when `RDS_CONNECTION` is undefined — events can fire between login and the ready
handler assigning it, and having nowhere to write yet is not an error.

A Mongo outage therefore costs you telemetry and nothing else.

---

## Gateway requirements

Reaction tracking needed two additions to `Src/Subsystems/Operations/OPs_CoreClient.ts`:

- **`GatewayIntentBits.GuildMessageReactions`** — without it the event never fires at all.
- **`Partials.Message`, `Partials.Channel`, `Partials.Reaction`, `Partials.User`** — reactions
  arrive uncached whenever the message predates the current session, which is most of them.
  Without partials the counter would only ever see reactions on messages posted since the last
  restart.

Because the reactor can arrive partial, `messageReactionAdd` fetches before reading `username`,
and gives up quietly if the account is gone.

---

## `/profile`

```
/profile [officer]
```

Defaults to the invoker. Renders an embed with the three headline counters, join date and time
aboard, and first/last activity. `Commands Failed` only appears when it's non-zero — a zero
there is the normal case and doesn't deserve a field.

Two states worth calling out:

**No record.** Renders "No telemetry on file for this officer yet" rather than a wall of zeroes.
Never-seen and seen-but-idle are different answers, and `getUserStats` returns `null` rather
than a zeroed record specifically so the command can tell them apart.

**Member has left.** The counters outlive the membership, so the profile still renders — falling
back to the stored `username` for the title and dropping the join field.

### The footer is load-bearing

> *Personnel File • counters run from LCARS deployment, not from your join date*

Nothing backfills history. Every counter starts at zero when this ships, so a member of three
years and a member of three days both start from nothing. Without that line the numbers read as
lifetime totals, which they are not.

---

## Files

| Path | Role |
|---|---|
| `Src/Subsystems/Auxiliary/Interfaces/UserStatsInterface.ts` | `UserStatsRecord`, `UserStatField` |
| `Src/Subsystems/Stats/Stats_Utilities.ts` | Upsert, read, index |
| `Src/Events/messageCreate.ts` | `MESSAGES` |
| `Src/Events/interactionCreate.ts` | `COMMANDS`, `COMMANDS_FAILED` |
| `Src/Events/messageReactionAdd.ts` | `REACTIONS` |
| `Src/Commands/Active/profile.ts` | `/profile` and `buildProfileEmbed` |
| `Src/Subsystems/Operations/OPs_CoreClient.ts` | Reaction intent and partials |
