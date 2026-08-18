# AMP Integration Feature

**Repository:** [LCARS47](https://github.com/SkyeRangerDelta/LCARS47)
**Related Issue:** [#80](https://github.com/SkyeRangerDelta/LCARS47/issues/80)
**Branch:** API-Enhancements

---

## Overview

The AMP integration lets Planetary Dynamics operators start, stop and inspect
game server instances from Discord instead of the AMP web panel.

### What is AMP?

AMP (Application Management Panel) by CubeCoders is the game server control panel
running on **Impulse Controller** at `https://amp.pldyn.net`. It owns every game
server instance — Minecraft, Vintage Story and the rest — and exposes a complete
HTTP API for controlling them.

### Why add this?

- **No panel round trip.** "Is the Minecraft server up?" is answered in the
  channel where it was asked.
- **Ops where the people are.** Restarting a stuck server no longer requires
  finding a browser and logging into the panel.
- **Honest feedback.** AMP accepts a start and works on it in the background, so
  the bot follows the instance until it settles instead of declaring victory
  immediately.
- **Least privilege.** The bot authenticates as a dedicated AMP account with only
  start/stop permissions, and destructive actions are gated to admins on the
  Discord side too.

---

## Command Usage

### `/amp list`

Every game server instance and its current state, in one embed. Open to all guild
members.

```
/amp list
```

Each line shows a state icon, the instance's friendly name, its state, and the
AMP module backing it. The footer reports how many are running and how old the
cached list is.

### `/amp status`

Live statistics for one instance. Open to all guild members.

```
/amp status instance:<instance>
```

- `instance` (required, autocomplete) — pick from the instance list. Choices show
  the current state, so the picker doubles as a quick overview.

The embed reports state, uptime, module and disk usage, followed by
whatever metrics that instance's module publishes — CPU, memory and player count
for a Minecraft server, something different for another module. State is read
live from AMP, never from the cache behind autocomplete.

### Two layers: instance vs server

AMP controls two separate things, and `/amp` keeps them separate rather than
guessing which one you meant:

| | What it is | Command |
| --- | --- | --- |
| **Instance** | the AMP instance itself — the machine | `/amp instance start\|stop` |
| **Server** | the game server running inside it — the service | `/amp server start\|stop` |

**Starting an instance does not start its game server.** These instances are
configured that way on purpose, so bringing one online leaves it idle and ready,
and the reply tells you so and points at the next step. Putting a server into
service is a separate, deliberate act.

Typical sequence for bringing a game server up from cold:

```
/amp instance start instance:PlDyn Valheim     ->  instance online, game server not started
/amp server   start instance:PlDyn Valheim     ->  game server starting -> Ready
```

And back down again, in reverse:

```
/amp server   stop instance:PlDyn Valheim      ->  world saves, server stops
/amp instance stop instance:PlDyn Valheim      ->  instance offline
```

### `/amp instance start` / `/amp instance stop`

Brings the AMP instance itself up or down. **Admin only.**

`/amp instance stop` refuses while the game server is still running, and points
you at `/amp server stop` first — pulling the machine out from under a live world
risks an unclean save.

### `/amp server start` / `/amp server stop`

Starts or stops the game server inside an instance that is **already online**. If
the instance is offline there is nothing to talk to, and the command says so and
points at `/amp instance start`.

### How control commands report back

Replies are ephemeral so a refusal or a raw AMP error does not land in the
channel. Each proceeds in two phases, because AMP is asynchronous:

1. The command checks live state first and short-circuits the pointless cases —
   starting something already running just says so.
2. Otherwise the action is issued, the reply becomes *"…accepted. Standing by…"*,
   and the bot polls every 3 seconds for up to ~30 seconds until things settle,
   then edits in the final status.

If it is still starting when the poll budget runs out, the reply says exactly
that and suggests `/amp status` — a large world taking a while is not a failure
and is never reported as one. Equally, a server that fails to come up is never
reported as success.

---

## Permissions

`/amp list` and `/amp status` are available to every guild member. Everything
under `/amp instance` and `/amp server` is restricted:

- If `ADMIN_USER_IDS` is set, only those Discord user IDs may run them.
- If it is unset, the invoker needs the guild **Administrator** permission.

The whole command deliberately does *not* use Discord's
`setDefaultMemberPermissions`, because that would hide `list` and `status` from
ordinary users as well. The check happens at runtime in the command, using the
shared `isAdminUser()` helper.

AMP enforces its own permissions independently. If the AMP service account lacks
`Core.AppManagement.StartApplication`, the command says so rather than failing
silently.

---

## Crash monitoring

Nothing used to notice a game server dying — a Minecraft server crashing at 03:00
went unnoticed until someone tried to join. A background sweep now watches every
*running* server and speaks up when one falls over.

| Alert | When |
| --- | --- |
| 💥 **Server crashed** | the application dropped into Failed |
| ⚠️ **Server stopped unexpectedly** | a live server went quiet on its own |
| ⚠️ **Instance went offline** | the AMP instance itself stopped answering |
| ✅ **Server recovered** | it came back after one of the above |

Three things keep it honest:

- **Operator actions are not crashes.** Anything you did yourself through `/amp`,
  or in the two minutes after, is attributed to you and passes silently.
- **A single missed sample is not an outage.** An instance that stops answering
  has to miss twice in a row before it is called offline, since one miss can be
  a blip in the proxy. A definite state from AMP is trusted immediately.
- **A restart is not a crash.** Startup seeds current state without alerting, so
  a server that was already down before the bot started is not reported as news.

Recoveries are only announced if the fall was announced — a server coming up from
an ordinary stopped state is routine, not a recovery.

### `/amp monitor`

`/amp monitor status` shows what is being watched, when the last sweep ran, and
whether alerts are muted. Open to everyone.

`/amp monitor mute [minutes]` and `/amp monitor unmute` are admin only, for
planned maintenance. Muting still tracks state, it just stops announcing.

Alerts go to `AMP_ALERT_CHANNEL`, falling back to `ENGINEERING`.

### Cost

Measured against the live controller: a steady-state sweep is **one request per
running server** — 3 requests in 47ms for the current fleet, once a minute. Only
running instances are probed, and sweeps never overlap. The sweep also keeps the
per-instance proxy sessions alive, so nothing else has to.

## Audit trail

Every control action is recorded to a channel, not just the container console —
on a shared server *"who stopped Valheim?"* is a real question, and console logs
aren't somewhere the people asking it can look.

Each record carries the layer and action, the target, who did it (name and ID),
and what became of it. Recorded outcomes:

| Outcome | Meaning |
| --- | --- |
| **Completed** | reached the state it was asked to reach |
| **Failed** | AMP reported a failure, or the command errored |
| **Still in progress** | hadn't settled when the wait elapsed — neither success nor failure |
| **Denied** | someone without permission tried |

*Still in progress* is deliberately its own outcome rather than being folded into
one of the others; a large world that's simply slow to load has not failed, and
recording it as either would make the trail dishonest.

Records go to `AMP_AUDIT_CHANNEL`, falling back to `ENGINEERING`. A failure to
post is swallowed with a warning — an audit trail that can take a command down
with it is worse than none.

## Configuration

Add to `.env`:

```
AMP_URL=https://amp.pldyn.net
AMP_USERNAME=lcars47
AMP_PASSWORD=your_amp_api_user_password

# Optional — where control actions are recorded. Defaults to ENGINEERING.
AMP_AUDIT_CHANNEL=channel_id_for_amp_audit

# Optional — where crash alerts go. Defaults to ENGINEERING.
AMP_ALERT_CHANNEL=channel_id_for_amp_alerts
```

All three are required together — set none of them and the feature is simply
skipped at boot (`[AMP] Feature not enabled - skipping initialization.`).

### AMP-side setup

Create a **dedicated API user** in the AMP panel:

1. Grant it `Core.AppManagement.StartApplication` and
   `Core.AppManagement.StopApplication` on the instances it should control, plus
   visibility of those instances. Do not give it full admin.
2. **Do not enable two-factor authentication** on it — the API login cannot
   complete a 2FA challenge. The bot detects this case and reports it clearly.

---

## Behaviour Notes

- **The controller is hidden.** AMP lists itself among its own instances; it is
  filtered out, so `/amp instance stop` cannot take the whole panel offline.
- **Offline instances read as "Offline", not "Undefined".** AMP reports an
  application state of `-1` for every instance whose daemon is down — it has
  nothing to say about an application that is not running. `/amp` checks whether
  the instance is up before reading that field.
- **States are read from the servers themselves, not from the panel's summary.**
  AMP's controller keeps a cached view of its instances that can be tens of
  seconds behind reality, which is why a freshly started instance would otherwise
  linger on the old state. `/amp list` and `/amp status` ask each running
  instance directly, and the start/stop commands watch the instance itself rather
  than waiting for the panel's summary to catch up.
- **"Initialising" is a real state you will see briefly.** It means the instance
  is up but has not reported what its game server is doing yet. It settles within
  a few seconds.
- **Suspended instances are refused.** A suspended instance accepts a start
  command and then does nothing, so the command rejects it up front with an
  explanation.
- **`/amp status` works on offline instances too.** There is no live daemon to
  query, so it reports what the controller knows — state, module, disk usage —
  rather than surfacing AMP's "Instance Unavailable" as an error.
- **No connection details are ever shown.** `/amp status` is open to everyone,
  and the address AMP reports is the listening socket rather than anything a
  player connects to. Connect details stay something you hand out deliberately.
- **The instance list is cached for 60 seconds.** Autocomplete has a hard ~3
  second deadline that cannot be deferred, so that path is served from cache and
  never triggers a network round trip on the critical path. Live state is always
  re-read for `status`, `start` and `stop`, and the cache is invalidated after
  every action.
- **Degradation is graceful.** If AMP is unreachable at boot, the bot logs a
  warning and starts anyway; `/amp` then reports that the integration is
  unavailable rather than erroring.

---

## Related

- [`docs/technical/amp-api-integration.md`](../technical/amp-api-integration.md) —
  protocol details, session lifecycle, error taxonomy, and the proxy-auth
  fallback.
