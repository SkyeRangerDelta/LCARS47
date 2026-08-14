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

The embed reports state, uptime, module, address and disk usage, followed by
whatever metrics that instance's module publishes — CPU, memory and player count
for a Minecraft server, something different for another module. State is read
live from AMP, never from the cache behind autocomplete.

### `/amp start` / `/amp stop`

Start or stop an instance. **Admin only** — see [Permissions](#permissions).

```
/amp start instance:<instance>
/amp stop  instance:<instance>
```

Replies are ephemeral so a refusal or a raw AMP error does not land in the
channel.

The reply proceeds in two phases, because AMP is asynchronous:

1. The command checks live state first and short-circuits the pointless cases —
   starting something already running just says so.
2. Otherwise the action is issued, the reply becomes *"Start command accepted.
   Standing by…"*, and the bot polls every 3 seconds for up to ~30 seconds until
   the instance reaches a settled state, then edits in the final status embed.

If the instance is still starting when the poll budget runs out, the reply says
exactly that and suggests `/amp status` — a large world taking a while is not a
failure, and is never reported as one. Equally, a server that fails to come up is
never reported as success.

---

## Permissions

`/amp list` and `/amp status` are available to every guild member. `/amp start`
and `/amp stop` are restricted:

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

## Configuration

Add to `.env`:

```
AMP_URL=https://amp.pldyn.net
AMP_USERNAME=lcars47
AMP_PASSWORD=your_amp_api_user_password
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
  filtered out, so `/amp stop` cannot take the whole panel offline.
- **Suspended instances are refused.** A suspended instance accepts a start
  command and then does nothing, so the command rejects it up front with an
  explanation.
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
